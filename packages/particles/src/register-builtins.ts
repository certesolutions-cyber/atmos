import { registerComponent } from '@certe/atmos-core';
import { ParticleEmitter } from './particle-emitter.js';
import { ParticleRenderer } from './particle-renderer.js';

/** Register particle components for the editor inspector. */
export function registerParticleBuiltins(): void {
  registerComponent(ParticleEmitter, {
    name: 'ParticleEmitter',
    properties: [
      // Emission
      { key: 'emitting', type: 'boolean' },
      { key: 'emissionRate', type: 'number', min: 0, max: 1000, step: 1 },
      { key: 'maxParticles', type: 'number', min: 1, max: 10000, step: 1 },

      // Lifetime
      { key: 'lifetimeMin', type: 'number', min: 0.01, max: 30, step: 0.1 },
      { key: 'lifetimeMax', type: 'number', min: 0.01, max: 30, step: 0.1 },

      // Velocity
      { key: 'speedMin', type: 'number', min: 0, max: 50, step: 0.1 },
      { key: 'speedMax', type: 'number', min: 0, max: 50, step: 0.1 },
      { key: 'spread', type: 'number', min: 0, max: 3.14159, step: 0.01 },

      // Physics
      { key: 'gravity', type: 'number', min: -20, max: 20, step: 0.1 },

      // Size
      { key: 'startSize', type: 'number', min: 0, max: 10, step: 0.01 },
      { key: 'endSize', type: 'number', min: 0, max: 10, step: 0.01 },

      // Start color
      { key: 'startColorR', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'startColorG', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'startColorB', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'startAlpha', type: 'number', min: 0, max: 1, step: 0.01 },

      // End color
      { key: 'endColorR', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'endColorG', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'endColorB', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'endAlpha', type: 'number', min: 0, max: 1, step: 0.01 },

      // Rotation
      { key: 'rotationSpeedMin', type: 'number', min: -10, max: 10, step: 0.1 },
      { key: 'rotationSpeedMax', type: 'number', min: -10, max: 10, step: 0.1 },
    ],
  });

  registerComponent(ParticleRenderer, {
    name: 'ParticleRenderer',
    properties: [
      { key: 'additive', type: 'boolean' },
    ],
  });
}
