import { registerComponent } from '@atmos/core';
import { MeshRenderer } from './mesh-renderer.js';
import { Camera } from './camera.js';

export function registerRendererBuiltins(): void {
  registerComponent(MeshRenderer, {
    name: 'MeshRenderer',
    properties: [
      { key: 'meshSource', type: 'string' },
      { key: 'materialSource', type: 'materialAsset' },
      { key: 'material.albedo', type: 'color' },
      { key: 'material.metallic', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'material.roughness', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  });

  registerComponent(Camera, {
    name: 'Camera',
    properties: [
      { key: 'fovY', type: 'number', min: 0.1, max: 3.14, step: 0.01 },
      { key: 'near', type: 'number', min: 0.001, max: 100, step: 0.01 },
      { key: 'far', type: 'number', min: 1, max: 10000, step: 1 },
      { key: 'isMainCamera', type: 'boolean' },
    ],
  });
}
