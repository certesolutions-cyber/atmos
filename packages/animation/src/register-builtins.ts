import { registerComponent } from '@atmos/core';
import { AnimationHandler } from './animation-handler.js';

/** Register animation components (AnimationHandler). */
export function registerAnimationBuiltins(): void {
  registerComponent(AnimationHandler, {
    name: 'AnimationHandler',
    properties: [
      {
        key: 'initialClip', type: 'enum', options: [],
        optionsFrom: (t) => (t as AnimationHandler).clipNames,
      },
      { key: 'speed', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'loop', type: 'boolean' },
      { key: 'autoplay', type: 'boolean' },
    ],
  });
}
