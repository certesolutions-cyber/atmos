/**
 * AnimationMixer component: manages animation playback, blending, and crossfade.
 * Produces bone matrices each frame for GPU skinning.
 */

import { Component } from '@atmos/core';
import { Quat } from '@atmos/math';
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
  skeleton: Skeleton | null = null;
  /** Final bone matrices (jointCount * 16 floats), uploaded to GPU each frame. */
  boneMatrices: Float32Array | null = null;

  private _layers: AnimationLayer[] = [];

  // Per-joint blended T/R/S (allocated when skeleton is set)
  private _blendedT: Float32Array | null = null;
  private _blendedR: Float32Array | null = null;
  private _blendedS: Float32Array | null = null;

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
    to._fadeTarget = 1;
    to._fadeSpeed = (1 - to.weight) / d;
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

  onUpdate(dt: number): void {
    if (!this.skeleton) return;

    const jc = this.skeleton.jointCount;

    // Lazy-allocate blending arrays
    if (!this._blendedT || this._blendedT.length !== jc * 3) {
      this._blendedT = new Float32Array(jc * 3);
      this._blendedR = new Float32Array(jc * 4);
      this._blendedS = new Float32Array(jc * 3);
      this.boneMatrices = new Float32Array(jc * 16);
    }

    // Advance layers and handle fades
    this._advanceLayers(dt);

    // Clear blended pose to identity
    this._resetBlendedPose(jc);

    // Accumulate weighted samples from each layer
    let totalWeight = 0;
    for (const layer of this._layers) {
      if (!layer.playing || layer.weight <= 0) continue;
      this._accumulateLayer(layer, jc);
      totalWeight += layer.weight;
    }

    // Fix up joints: normalize rotations, default uncovered joints to identity
    for (let j = 0; j < jc; j++) {
      const rOff = j * 4;
      const rx = this._blendedR![rOff] ?? 0;
      const ry = this._blendedR![rOff + 1] ?? 0;
      const rz = this._blendedR![rOff + 2] ?? 0;
      const rw = this._blendedR![rOff + 3] ?? 0;
      const lenSq = rx * rx + ry * ry + rz * rz + rw * rw;
      if (lenSq > 1e-8) {
        // Normalize accumulated quaternion
        Quat.normalize(
          this._blendedR!.subarray(rOff, rOff + 4),
          this._blendedR!.subarray(rOff, rOff + 4),
        );
      } else {
        // No rotation tracks → identity quaternion
        this._blendedR![rOff] = 0;
        this._blendedR![rOff + 1] = 0;
        this._blendedR![rOff + 2] = 0;
        this._blendedR![rOff + 3] = 1;
      }
      // Default uncovered scale joints to (1,1,1)
      const sOff = j * 3;
      const sx = this._blendedS![sOff] ?? 0;
      const sy = this._blendedS![sOff + 1] ?? 0;
      const sz = this._blendedS![sOff + 2] ?? 0;
      if (sx === 0 && sy === 0 && sz === 0) {
        this._blendedS![sOff] = 1;
        this._blendedS![sOff + 1] = 1;
        this._blendedS![sOff + 2] = 1;
      }
    }

    // Compute final bone matrices
    computeBoneMatrices(
      this.boneMatrices!,
      this.skeleton,
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

  private _resetBlendedPose(jointCount: number): void {
    // Zero everything for additive weighted accumulation.
    // Joints with no track contributions get fixed up after accumulation.
    this._blendedT!.fill(0);
    this._blendedR!.fill(0);
    this._blendedS!.fill(0);
  }

  private _accumulateLayer(layer: AnimationLayer, jointCount: number): void {
    const w = layer.weight;
    const bt = this._blendedT!;
    const br = this._blendedR!;
    const bs = this._blendedS!;

    // Sample each track and blend
    for (const track of layer.clip.tracks) {
      const ji = track.jointIndex;
      if (ji < 0 || ji >= jointCount) continue;

      switch (track.channel) {
        case 'translation': {
          sampleTrack(_sampledT, track, layer.time);
          const off = ji * 3;
          bt[off] = (bt[off] ?? 0) + _sampledT[0]! * w;
          bt[off + 1] = (bt[off + 1] ?? 0) + _sampledT[1]! * w;
          bt[off + 2] = (bt[off + 2] ?? 0) + _sampledT[2]! * w;
          break;
        }
        case 'rotation': {
          sampleTrack(_sampledR, track, layer.time);
          const rOff = ji * 4;
          // Weighted quaternion accumulation (shortest path)
          _blendR[0] = br[rOff] ?? 0;
          _blendR[1] = br[rOff + 1] ?? 0;
          _blendR[2] = br[rOff + 2] ?? 0;
          _blendR[3] = br[rOff + 3] ?? 0;
          // Ensure shortest path (dot product check)
          const dot = _blendR[0]! * _sampledR[0]! + _blendR[1]! * _sampledR[1]! +
                      _blendR[2]! * _sampledR[2]! + _blendR[3]! * _sampledR[3]!;
          const sign = dot < 0 ? -1 : 1;
          br[rOff] = (br[rOff] ?? 0) + _sampledR[0]! * w * sign;
          br[rOff + 1] = (br[rOff + 1] ?? 0) + _sampledR[1]! * w * sign;
          br[rOff + 2] = (br[rOff + 2] ?? 0) + _sampledR[2]! * w * sign;
          br[rOff + 3] = (br[rOff + 3] ?? 0) + _sampledR[3]! * w * sign;
          break;
        }
        case 'scale': {
          sampleTrack(_sampledS, track, layer.time);
          const sOff = ji * 3;
          bs[sOff] = (bs[sOff] ?? 0) + _sampledS[0]! * w;
          bs[sOff + 1] = (bs[sOff + 1] ?? 0) + _sampledS[1]! * w;
          bs[sOff + 2] = (bs[sOff + 2] ?? 0) + _sampledS[2]! * w;
          break;
        }
      }
    }

    // For joints not covered by this layer's tracks, we need to add identity contributions.
    // But since we only add tracks that exist, uncovered joints get zero contribution.
    // We handle this by setting default identity in _resetBlendedPose and only accumulating
    // tracks that exist. Joints without tracks in any layer keep the identity pose.
    // However, scale needs special handling: zero scale would collapse the mesh.
    // We fix this after all layers accumulate by checking for zero-weight joints.
  }
}
