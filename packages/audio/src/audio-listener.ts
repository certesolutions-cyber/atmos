import { Component } from '@certe/atmos-core';
import { getAudioContext } from './audio-context.js';

/**
 * AudioListener component — attach to the camera or player GameObject.
 *
 * There should only be one active AudioListener in a scene.
 * On each render tick it syncs the Web Audio API listener position
 * and orientation from the GameObject's world transform.
 */
export class AudioListener extends Component {
  /** Master volume (0–1). */
  masterVolume = 1;

  private _gain: GainNode | null = null;

  /** The master gain node. All AudioSource nodes connect through this. */
  get gain(): GainNode | null {
    return this._gain;
  }

  onAwake(): void {
    const ctx = getAudioContext();
    this._gain = ctx.createGain();
    this._gain.gain.value = this.masterVolume;
    this._gain.connect(ctx.destination);
  }

  onRender(): void {
    if (!this._gain) return;
    this._gain.gain.value = this.masterVolume;

    const ctx = getAudioContext();
    const listener = ctx.listener;
    const world = this.gameObject.transform.worldMatrix;

    // Extract position from column 3
    const px = world[12]!;
    const py = world[13]!;
    const pz = world[14]!;

    // Extract forward (-Z axis) and up (+Y axis) from the rotation part
    const fx = -world[8]!;
    const fy = -world[9]!;
    const fz = -world[10]!;
    const ux = world[4]!;
    const uy = world[5]!;
    const uz = world[6]!;

    if (listener.positionX) {
      // Modern API (AudioParam-based)
      const t = ctx.currentTime;
      listener.positionX.setValueAtTime(px, t);
      listener.positionY.setValueAtTime(py, t);
      listener.positionZ.setValueAtTime(pz, t);
      listener.forwardX.setValueAtTime(fx, t);
      listener.forwardY.setValueAtTime(fy, t);
      listener.forwardZ.setValueAtTime(fz, t);
      listener.upX.setValueAtTime(ux, t);
      listener.upY.setValueAtTime(uy, t);
      listener.upZ.setValueAtTime(uz, t);
    } else {
      // Legacy API fallback
      listener.setPosition(px, py, pz);
      listener.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  onDestroy(): void {
    if (this._gain) {
      this._gain.disconnect();
      this._gain = null;
    }
  }
}
