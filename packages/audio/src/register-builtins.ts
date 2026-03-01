import { registerComponent } from '@certe/atmos-core';
import { AudioListener } from './audio-listener.js';
import { AudioSource } from './audio-source.js';

/** Register audio components so they appear in the editor inspector. */
export function registerAudioBuiltins(): void {
  registerComponent(AudioListener, {
    name: 'AudioListener',
    properties: [
      { key: 'masterVolume', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  });

  registerComponent(AudioSource, {
    name: 'AudioSource',
    allowMultiple: true,
    properties: [
      { key: 'clipUrl', type: 'string' },
      { key: 'volume', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'pitch', type: 'number', min: 0.1, max: 4, step: 0.1 },
      { key: 'loop', type: 'boolean' },
      { key: 'autoplay', type: 'boolean' },
      { key: 'spatial', type: 'boolean' },
      {
        key: 'distanceModel', type: 'enum',
        options: ['linear', 'inverse', 'exponential'],
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
      {
        key: 'refDistance', type: 'number', min: 0, max: 1000, step: 0.5,
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
      {
        key: 'maxDistance', type: 'number', min: 1, max: 10000, step: 1,
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
      {
        key: 'rolloffFactor', type: 'number', min: 0, max: 10, step: 0.1,
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
      {
        key: 'coneInnerAngle', type: 'number', min: 0, max: 360, step: 1,
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
      {
        key: 'coneOuterAngle', type: 'number', min: 0, max: 360, step: 1,
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
      {
        key: 'coneOuterGain', type: 'number', min: 0, max: 1, step: 0.01,
        visibleWhen: (t) => (t as AudioSource).spatial,
      },
    ],
  });
}
