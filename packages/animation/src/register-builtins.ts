import { registerComponent } from '@atmos/core';
import { AnimationMixer } from './animation-mixer.js';

export function registerAnimationBuiltins(): void {
  registerComponent(AnimationMixer, {
    name: 'AnimationMixer',
    properties: [],
  });
}
