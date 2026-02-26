/**
 * AnimationMixer component: manages animation playback, blending, and crossfade.
 * Produces bone matrices each frame for GPU skinning.
 */

import { Component } from '@certe/atmos-core';
import { Quat } from '@certe/atmos-math';
import type { Skeleton } from './skeleton.js';
import type { AnimationClip } from './animation-clip.js';
import { sampleTrack } from './keyframe-sampler.js';
import { computeBoneMatrices } from './pose.js';

/** A single active animation layer. */
export interface AnimationLayer {
  clip: AnimationClip;
  time: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
  /** Internal: used for crossfade weight ramping. */
  _fadeSpeed: number;
  /** Internal: target weight for crossfade. */
  _fadeTarget: number;
}

// Scratch arrays for blending (module-level, zero alloc)
const _sampledT = new Float32Array(3);
const _sampledR = new Float32Array(4);
const _sampledS = new Float32Array(3);
const _blendR = new Float32Array(4);

export class AnimationMixer extends Component {
  /** Final bone matrices (jointCount * 16 floats), uploaded to GPU each frame. */
  boneMatrices: Float32Array | null = null;

  /** Which clip to auto-play on start. */
  initialClip = '';
  /** Default playback speed multiplier. */
  speed = 1;
  /** Whether clips loop by default. */
  loop = true;
  /** Whether to auto-play initialClip on start. */
  autoplay = true;

  private _skeleton: Skeleton | null = null;
  private _layers: AnimationLayer[] = [];
  private _clips = new Map<string, AnimationClip>();

  // Per-joint blended T/R/S (allocated when skeleton is set)
  private _blendedT: Float32Array | null = null;
  private _blendedR: Float32Array | null = null;
  private _blendedS: Float32Array | null = null;

  // Accumulated rotation weight per joint (for rest-pose fill after blending)
  private _accumWeightR: Float32Array | null = null;

  get skeleton(): Skeleton | null { return this._skeleton; }

  set skeleton(sk: Skeleton | null) {
    this._skeleton = sk;
    if (sk) {
      const jc = sk.jointCount;
      this._blendedT = new Float32Array(jc * 3);
      this._blendedR = new Float32Array(jc * 4);
      this._blendedS = new Float32Array(jc * 3);
      this.boneMatrices = new Float32Array(jc * 16);
      // Compute rest-pose bone matrices immediately so GPU has valid data before first update
      this._blendedT.set(sk.restT);
      this._blendedR.set(sk.restR);
      this._blendedS.set(sk.restS);
      computeBoneMatrices(this.boneMatrices, sk, this._blendedT, this._blendedR, this._blendedS);
    } else {
      this.boneMatrices = null;
      this._blendedT = null;
      this._blendedR = null;
      this._blendedS = null;
    }
  }

  /** Reset bone matrices to rest pose and stop all layers. */
  resetToRestPose(): void {
    const sk = this._skeleton;
    if (!sk || !this.boneMatrices || !this._blendedT) return;
    this._layers.length = 0;
    this._blendedT.set(sk.restT);
    this._blendedR!.set(sk.restR);
    this._blendedS!.set(sk.restS);
    computeBoneMatrices(this.boneMatrices, sk, this._blendedT, this._blendedR!, this._blendedS!);
  }

  /** Play a clip, returning the layer handle. */
  play(clip: AnimationClip, opts?: {
    speed?: number;
    weight?: number;
    loop?: boolean;
  }): AnimationLayer {
    const layer: AnimationLayer = {
      clip,
      time: 0,
      speed: opts?.speed ?? 1,
      weight: opts?.weight ?? 1,
      loop: opts?.loop ?? true,
      playing: true,
      _fadeSpeed: 0,
      _fadeTarget: opts?.weight ?? 1,
    };
    this._layers.push(layer);
    return layer;
  }

  /**
   * Crossfade from one layer to another over `duration` seconds.
   * `from` fades to 0 weight, `to` fades to 1 weight.
   */
  crossFade(from: AnimationLayer, to: AnimationLayer, duration: number): void {
    const d = Math.max(duration, 0.001);
    from._fadeTarget = 0;
    from._fadeSpeed = from.weight / d;
    to.weight = 0;
    to._fadeTarget = 1;
    to._fadeSpeed = 1 / d;
  }

  /** Stop and remove a layer. */
  stop(layer: AnimationLayer): void {
    layer.playing = false;
    const idx = this._layers.indexOf(layer);
    if (idx >= 0) this._layers.splice(idx, 1);
  }

  /** Get all active layers (read-only). */
  get layers(): readonly AnimationLayer[] {
    return this._layers;
  }

  /** Register a clip by name. */
  addClip(clip: AnimationClip): void {
    this._clips.set(clip.name, clip);
  }

  /** Sorted list of registered clip names. */
  get clipNames(): string[] {
    return [...this._clips.keys()].sort();
  }

  /** Name of the currently playing clip (first layer), or empty string. */
  get currentClip(): string {
    const first = this._layers[0];
    return first ? first.clip.name : '';
  }

  /** Play a clip by name, with optional crossfade from the current clip. */
  playByName(name: string, opts?: {
    speed?: number;
    loop?: boolean;
    crossFadeDuration?: number;
  }): AnimationLayer | null {
    const clip = this._clips.get(name);
    if (!clip) return null;
    const layer = this.play(clip, {
      speed: opts?.speed ?? this.speed,
      loop: opts?.loop ?? this.loop,
    });
    if (opts?.crossFadeDuration && this._layers.length > 1) {
      const from = this._layers[this._layers.length - 2]!;
      this.crossFade(from, layer, opts.crossFadeDuration);
    }
    return layer;
  }

  onStart(): void {
    if (this.autoplay && this.initialClip) {
      this.playByName(this.initialClip, { speed: this.speed, loop: this.loop });
    }
  }

  onUpdate(dt: number): void {
    if (!this._skeleton || !this._blendedT) return;

    const jc = this._skeleton.jointCount;

    // Advance layers and handle fades
    this._advanceLayers(dt);

    // Start from rest pose (T/S stay as rest, R zeroed for accumulation)
    const sk = this._skeleton;
    this._blendedT!.set(sk.restT);
    this._blendedS!.set(sk.restS);
    this._blendedR!.fill(0);

    // Track accumulated rotation weight per joint
    if (!this._accumWeightR || this._accumWeightR.length !== jc) {
      this._accumWeightR = new Float32Array(jc);
    }
    this._accumWeightR.fill(0);

    // Accumulate weighted samples
    for (const layer of this._layers) {
      if (!layer.playing || layer.weight <= 0) continue;
      this._accumulateLayer(layer, jc);
    }

    // Fill in rest-pose quaternion for joints not fully covered by animations
    const br = this._blendedR!;
    for (let j = 0; j < jc; j++) {
      const aw = this._accumWeightR![j]!;
      const rOff = j * 4;
      if (aw < 0.001) {
        // No animation touched this joint — use rest pose directly
        br[rOff] = sk.restR[rOff]!;
        br[rOff + 1] = sk.restR[rOff + 1]!;
        br[rOff + 2] = sk.restR[rOff + 2]!;
        br[rOff + 3] = sk.restR[rOff + 3]!;
      } else if (aw < 0.999) {
        // Partially covered — blend in rest pose for remaining weight
        const restW = 1 - aw;
        const dot = br[rOff]! * sk.restR[rOff]! + br[rOff + 1]! * sk.restR[rOff + 1]! +
                    br[rOff + 2]! * sk.restR[rOff + 2]! + br[rOff + 3]! * sk.restR[rOff + 3]!;
        const sign = dot < 0 ? -1 : 1;
        br[rOff] = br[rOff]! + sk.restR[rOff]! * restW * sign;
        br[rOff + 1] = br[rOff + 1]! + sk.restR[rOff + 1]! * restW * sign;
        br[rOff + 2] = br[rOff + 2]! + sk.restR[rOff + 2]! * restW * sign;
        br[rOff + 3] = br[rOff + 3]! + sk.restR[rOff + 3]! * restW * sign;
      }
      Quat.normalize(
        br.subarray(rOff, rOff + 4),
        br.subarray(rOff, rOff + 4),
      );
    }

    // Compute final bone matrices
    computeBoneMatrices(
      this.boneMatrices!,
      this._skeleton,
      this._blendedT!,
      this._blendedR!,
      this._blendedS!,
    );
  }

  private _advanceLayers(dt: number): void {
    for (let i = this._layers.length - 1; i >= 0; i--) {
      const layer = this._layers[i]!;
      if (!layer.playing) continue;

      // Advance time
      layer.time += dt * layer.speed;

      // Loop or clamp
      if (layer.loop) {
        if (layer.clip.duration > 0) {
          layer.time = layer.time % layer.clip.duration;
          if (layer.time < 0) layer.time += layer.clip.duration;
        }
      } else {
        layer.time = Math.min(layer.time, layer.clip.duration);
      }

      // Apply fade
      if (layer._fadeSpeed > 0) {
        if (layer.weight < layer._fadeTarget) {
          layer.weight = Math.min(layer.weight + layer._fadeSpeed * dt, layer._fadeTarget);
        } else if (layer.weight > layer._fadeTarget) {
          layer.weight = Math.max(layer.weight - layer._fadeSpeed * dt, layer._fadeTarget);
        }

        // Remove fully faded-out layers
        if (layer._fadeTarget === 0 && layer.weight <= 0) {
          this._layers.splice(i, 1);
        }
      }
    }
  }

  private _accumulateLayer(layer: AnimationLayer, jointCount: number): void {
    const w = layer.weight;
    const bt = this._blendedT!;
    const br = this._blendedR!;
    const bs = this._blendedS!;
    const sk = this._skeleton!;

    // Sample each track and blend using delta-from-rest for T/S,
    // weighted accumulation + rest fill for R (done in onUpdate post-pass).
    for (const track of layer.clip.tracks) {
      const ji = track.jointIndex;
      if (ji < 0 || ji >= jointCount) continue;

      switch (track.channel) {
        case 'translation': {
          sampleTrack(_sampledT, track, layer.time);
          const off = ji * 3;
          // Delta from rest: bt starts at restT, add (sampled - rest) * weight
          bt[off] = bt[off]! + (_sampledT[0]! - sk.restT[off]!) * w;
          bt[off + 1] = bt[off + 1]! + (_sampledT[1]! - sk.restT[off + 1]!) * w;
          bt[off + 2] = bt[off + 2]! + (_sampledT[2]! - sk.restT[off + 2]!) * w;
          break;
        }
        case 'rotation': {
          sampleTrack(_sampledR, track, layer.time);
          const rOff = ji * 4;
          this._accumWeightR![ji] = this._accumWeightR![ji]! + w;
          // Weighted quaternion accumulation (shortest path)
          _blendR[0] = br[rOff]!;
          _blendR[1] = br[rOff + 1]!;
          _blendR[2] = br[rOff + 2]!;
          _blendR[3] = br[rOff + 3]!;
          const dot = _blendR[0]! * _sampledR[0]! + _blendR[1]! * _sampledR[1]! +
                      _blendR[2]! * _sampledR[2]! + _blendR[3]! * _sampledR[3]!;
          const sign = dot < 0 ? -1 : 1;
          br[rOff] = br[rOff]! + _sampledR[0]! * w * sign;
          br[rOff + 1] = br[rOff + 1]! + _sampledR[1]! * w * sign;
          br[rOff + 2] = br[rOff + 2]! + _sampledR[2]! * w * sign;
          br[rOff + 3] = br[rOff + 3]! + _sampledR[3]! * w * sign;
          break;
        }
        case 'scale': {
          sampleTrack(_sampledS, track, layer.time);
          const sOff = ji * 3;
          // Delta from rest: bs starts at restS, add (sampled - rest) * weight
          bs[sOff] = bs[sOff]! + (_sampledS[0]! - sk.restS[sOff]!) * w;
          bs[sOff + 1] = bs[sOff + 1]! + (_sampledS[1]! - sk.restS[sOff + 1]!) * w;
          bs[sOff + 2] = bs[sOff + 2]! + (_sampledS[2]! - sk.restS[sOff + 2]!) * w;
          break;
        }
      }
    }
  }
}
