import { getAudioContext } from './audio-context.js';

/**
 * An AudioClip wraps a decoded AudioBuffer.
 *
 * Clips can be loaded from a URL or created directly from an ArrayBuffer.
 */
export class AudioClip {
  readonly name: string;
  private _buffer: AudioBuffer | null = null;

  constructor(name: string, buffer?: AudioBuffer) {
    this.name = name;
    this._buffer = buffer ?? null;
  }

  get buffer(): AudioBuffer | null {
    return this._buffer;
  }

  get duration(): number {
    return this._buffer?.duration ?? 0;
  }

  get loaded(): boolean {
    return this._buffer !== null;
  }

  /** Decode an ArrayBuffer into this clip. */
  async decodeFromArrayBuffer(data: ArrayBuffer): Promise<void> {
    const ctx = getAudioContext();
    this._buffer = await ctx.decodeAudioData(data);
  }

  /** Fetch and decode audio from a URL. */
  static async fromURL(url: string, name?: string): Promise<AudioClip> {
    const clip = new AudioClip(name ?? url);
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    await clip.decodeFromArrayBuffer(data);
    return clip;
  }

  /** Create a clip from an existing AudioBuffer. */
  static fromBuffer(name: string, buffer: AudioBuffer): AudioClip {
    return new AudioClip(name, buffer);
  }
}
