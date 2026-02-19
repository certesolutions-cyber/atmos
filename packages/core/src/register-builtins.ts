import { registerComponent } from './component-registry.js';
import { Transform } from './transform.js';

export function registerCoreBuiltins(): void {
  registerComponent(Transform, {
    name: 'Transform',
    properties: [
      { key: 'position', type: 'vec3' },
      { key: 'rotation', type: 'quat' },
      { key: 'scale', type: 'vec3' },
    ],
  });
}
