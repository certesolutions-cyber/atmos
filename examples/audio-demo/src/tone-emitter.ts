import { Component } from '@certe/atmos-core';
import { AudioClip, AudioSource, getAudioContext } from '@certe/atmos-audio';

export type WaveForm = 'sine' | 'square' | 'noise';

/**
 * Script component that generates a procedural audio clip
 * and feeds it into a sibling AudioSource component.
 *
 * Usage: attach both AudioSource and ToneEmitter to the same GameObject.
 * Set waveform/frequency/duration via inspector properties, and
 * AudioSource.autoplay = true to hear it on start.
 */
export class ToneEmitter extends Component {
  waveform: WaveForm = 'sine';
  frequency = 440;
  duration = 2;
  amplitude = 0.5;

  onStart(): void {
    const source = this.getComponent(AudioSource);
    if (!source) return;

    const clip = this._generateClip();
    source.clip = clip;

    if (source.autoplay) {
      source.play();
    }
  }

  private _generateClip(): AudioClip {
    const ctx = getAudioContext();
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * this.duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    const fadeLength = Math.min(Math.floor(sampleRate * 0.01), Math.floor(length / 2));

    for (let i = 0; i < length; i++) {
      let envelope = 1;
      if (i < fadeLength) envelope = i / fadeLength;
      else if (i > length - fadeLength) envelope = (length - i) / fadeLength;

      let sample: number;
      switch (this.waveform) {
        case 'sine':
          sample = Math.sin(2 * Math.PI * this.frequency * i / sampleRate);
          break;
        case 'square': {
          const s = Math.sin(2 * Math.PI * this.frequency * i / sampleRate);
          sample = s >= 0 ? 1 : -1;
          break;
        }
        case 'noise':
          sample = Math.random() * 2 - 1;
          break;
      }
      data[i] = sample * this.amplitude * envelope;
    }

    return AudioClip.fromBuffer(`${this.waveform}-${this.frequency}`, buffer);
  }
}
