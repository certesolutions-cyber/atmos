/**
 * AnimationHandler: lives on model root, delegates to child AnimationMixers.
 * Provides a single control point for animation playback across all skinned meshes.
 */

import { Component, GameObject } from '@atmos/core';
import { AnimationMixer } from './animation-mixer.js';

export class AnimationHandler extends Component {
  /** Which clip to auto-play on start. */
  initialClip = '';
  /** Default playback speed multiplier. */
  speed = 1;
  /** Whether clips loop by default. */
  loop = true;
  /** Whether to auto-play initialClip on start. */
  autoplay = true;

  /** Recursively collect all AnimationMixers from this GameObject and descendants. */
  private _collectMixers(): AnimationMixer[] {
    const result: AnimationMixer[] = [];
    const walk = (go: GameObject) => {
      const mixer = go.getComponent(AnimationMixer);
      if (mixer) result.push(mixer);
      for (const child of go.children) walk(child);
    };
    walk(this.gameObject!);
    return result;
  }

  /** Union of all clip names across child mixers, sorted and deduplicated. */
  get clipNames(): string[] {
    const names = new Set<string>();
    for (const mixer of this._collectMixers()) {
      for (const n of mixer.clipNames) names.add(n);
    }
    return [...names].sort();
  }

  /** Name of the currently playing clip (from first mixer found), or empty string. */
  get currentClip(): string {
    const mixers = this._collectMixers();
    return mixers.length > 0 ? mixers[0]!.currentClip : '';
  }

  /** Play a clip by name on all child mixers. */
  play(name: string, opts?: {
    speed?: number;
    loop?: boolean;
    crossFadeDuration?: number;
  }): void {
    const speed = opts?.speed ?? this.speed;
    const loop = opts?.loop ?? this.loop;
    for (const mixer of this._collectMixers()) {
      mixer.playByName(name, {
        speed,
        loop,
        crossFadeDuration: opts?.crossFadeDuration,
      });
    }
  }

  /** Stop all layers on all child mixers. */
  stop(): void {
    for (const mixer of this._collectMixers()) {
      for (const layer of [...mixer.layers]) {
        mixer.stop(layer);
      }
    }
  }

  onStart(): void {
    // Disable autoplay on all child mixers so they don't play independently
    for (const mixer of this._collectMixers()) {
      mixer.autoplay = false;
    }
    // Stop any existing playback (e.g. from previous play cycle) before starting
    this.stop();
    if (this.autoplay && this.initialClip) {
      this.play(this.initialClip, { speed: this.speed, loop: this.loop });
    }
  }
}
