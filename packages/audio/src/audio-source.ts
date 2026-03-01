import { Component } from '@certe/atmos-core';
import { getAudioContext } from './audio-context.js';
import { AudioClip } from './audio-clip.js';
import { AudioListener } from './audio-listener.js';

export type DistanceModel = 'linear' | 'inverse' | 'exponential';

/**
 * AudioSource component — a 3D positional sound emitter.
 *
 * Attach to any GameObject. Set `clipUrl` (serializable, inspector-friendly)
 * or assign `clip` directly from a script. The source position is synced
 * from the GameObject's world transform each render tick.
 */
export class AudioSource extends Component {
  /**
   * URL to load audio from. Serializable, editable in inspector.
   * When set, the clip is loaded automatically in onAwake.
   */
  clipUrl = '';

  /**
   * The audio clip. Scripts can assign this directly for procedural audio.
   * When clipUrl is set, this is populated automatically.
   */
  clip: AudioClip | null = null;

  /** Volume (0–1). */
  volume = 1;

  /** Playback rate (1 = normal speed). */
  pitch = 1;

  /** Whether the clip loops. */
  loop = false;

  /** Play automatically when the clip is ready. */
  autoplay = false;

  /** If false, audio plays as 2D (non-spatial). */
  spatial = true;

  /** Distance model for spatial attenuation. */
  distanceModel: DistanceModel = 'inverse';

  /** Reference distance for the distance model. */
  refDistance = 1;

  /** Maximum distance for the distance model. */
  maxDistance = 100;

  /** Rolloff factor for distance attenuation. */
  rolloffFactor = 1;

  /** Inner cone angle in degrees (for directional audio). */
  coneInnerAngle = 360;

  /** Outer cone angle in degrees. */
  coneOuterAngle = 360;

  /** Gain outside the outer cone. */
  coneOuterGain = 0;

  private _panner: PannerNode | null = null;
  private _gainNode: GainNode | null = null;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _playing = false;
  private _startTime = 0;
  private _pauseOffset = 0;

  get playing(): boolean {
    return this._playing;
  }

  onAwake(): void {
    this._createNodes();

    if (this.clipUrl && !this.clip) {
      void AudioClip.fromURL(this.clipUrl).then((loaded) => {
        this.clip = loaded;
        if (this.autoplay) this.play();
      });
    }
  }

  onStart(): void {
    if (this.autoplay && this.clip?.loaded) {
      this.play();
    }
  }

  /** Start or resume playback. */
  play(): void {
    if (!this.clip?.buffer) return;
    this._createNodes();
    this._stopSourceNode();

    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = this.clip.buffer;
    source.loop = this.loop;
    source.playbackRate.value = this.pitch;
    source.onended = () => {
      if (this._sourceNode === source) {
        this._playing = false;
        this._sourceNode = null;
        this._pauseOffset = 0;
      }
    };

    source.connect(this._gainNode!);
    source.start(0, this._pauseOffset);
    this._sourceNode = source;
    this._playing = true;
    this._startTime = ctx.currentTime - this._pauseOffset;
  }

  /** Pause playback (can be resumed with play()). */
  pause(): void {
    if (!this._playing || !this._sourceNode) return;
    const ctx = getAudioContext();
    this._pauseOffset = (ctx.currentTime - this._startTime) % (this.clip?.duration ?? 1);
    this._stopSourceNode();
    this._playing = false;
  }

  /** Stop playback and reset to the beginning. */
  stop(): void {
    this._stopSourceNode();
    this._playing = false;
    this._pauseOffset = 0;
  }

  onRender(): void {
    this._syncPosition();
    this._syncParameters();
  }

  onDestroy(): void {
    this._stopSourceNode();
    this._playing = false;
    if (this._gainNode) {
      this._gainNode.disconnect();
      this._gainNode = null;
    }
    if (this._panner) {
      this._panner.disconnect();
      this._panner = null;
    }
  }

  private _createNodes(): void {
    if (this._gainNode) return;

    const ctx = getAudioContext();

    this._panner = ctx.createPanner();
    this._panner.panningModel = 'HRTF';
    this._panner.distanceModel = this.distanceModel;
    this._panner.refDistance = this.refDistance;
    this._panner.maxDistance = this.maxDistance;
    this._panner.rolloffFactor = this.rolloffFactor;
    this._panner.coneInnerAngle = this.coneInnerAngle;
    this._panner.coneOuterAngle = this.coneOuterAngle;
    this._panner.coneOuterGain = this.coneOuterGain;

    this._gainNode = ctx.createGain();
    this._gainNode.gain.value = this.volume;

    // Chain: source → gain → panner → listener.gain → destination
    this._gainNode.connect(this._panner);

    const listeners = AudioListener.findAll(AudioListener);
    const listenerGain = listeners[0]?.gain;
    if (listenerGain) {
      this._panner.connect(listenerGain);
    } else {
      this._panner.connect(ctx.destination);
    }
  }

  private _syncPosition(): void {
    if (!this._panner) return;

    const world = this.gameObject.transform.worldMatrix;
    const px = world[12]!;
    const py = world[13]!;
    const pz = world[14]!;

    if (this.spatial) {
      if (this._panner.positionX) {
        const ctx = getAudioContext();
        const t = ctx.currentTime;
        this._panner.positionX.setValueAtTime(px, t);
        this._panner.positionY.setValueAtTime(py, t);
        this._panner.positionZ.setValueAtTime(pz, t);
      } else {
        this._panner.setPosition(px, py, pz);
      }

      const fx = -world[8]!;
      const fy = -world[9]!;
      const fz = -world[10]!;
      if (this._panner.orientationX) {
        const ctx = getAudioContext();
        const t = ctx.currentTime;
        this._panner.orientationX.setValueAtTime(fx, t);
        this._panner.orientationY.setValueAtTime(fy, t);
        this._panner.orientationZ.setValueAtTime(fz, t);
      } else {
        this._panner.setOrientation(fx, fy, fz);
      }
    }
  }

  private _syncParameters(): void {
    if (this._gainNode) {
      this._gainNode.gain.value = this.volume;
    }
    if (this._sourceNode) {
      this._sourceNode.playbackRate.value = this.pitch;
      this._sourceNode.loop = this.loop;
    }
    if (this._panner) {
      this._panner.distanceModel = this.distanceModel;
      this._panner.refDistance = this.refDistance;
      this._panner.maxDistance = this.maxDistance;
      this._panner.rolloffFactor = this.rolloffFactor;
      this._panner.coneInnerAngle = this.coneInnerAngle;
      this._panner.coneOuterAngle = this.coneOuterAngle;
      this._panner.coneOuterGain = this.coneOuterGain;
    }
  }

  private _stopSourceNode(): void {
    if (this._sourceNode) {
      this._sourceNode.onended = null;
      try { this._sourceNode.stop(); } catch { /* already stopped */ }
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
  }
}
