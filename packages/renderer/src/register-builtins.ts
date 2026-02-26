import { registerComponent } from '@atmos/core';
import { MeshRenderer } from './mesh-renderer.js';
import { SkinnedMeshRenderer } from './skinned-mesh-renderer.js';
import { TerrainMeshRenderer } from './terrain-mesh-renderer.js';
import { Camera } from './camera.js';
import { DirectionalLight } from './directional-light.js';
import { PointLight } from './point-light.js';
import { SpotLight } from './spot-light.js';

export function registerRendererBuiltins(): void {
  registerComponent(MeshRenderer, {
    name: 'MeshRenderer',
    properties: [
      { key: 'meshSource', type: 'string' },
      { key: 'materialSource', type: 'materialAsset' },
      { key: 'material.albedo', type: 'color' },
      { key: 'material.metallic', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'material.roughness', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'material.emissive', type: 'color' },
      { key: 'material.emissiveIntensity', type: 'number', min: 0, max: 20, step: 0.1 },
      { key: 'material.texTilingX', type: 'number', min: 0.01, max: 100, step: 0.1 },
      { key: 'material.texTilingY', type: 'number', min: 0.01, max: 100, step: 0.1 },
      { key: 'castShadow', type: 'boolean' },
      { key: 'receiveSSAO', type: 'boolean' },
    ],
  });

  registerComponent(SkinnedMeshRenderer, {
    name: 'SkinnedMeshRenderer',
    properties: [
      { key: 'meshSource', type: 'string' },
      { key: 'materialSource', type: 'materialAsset' },
      { key: 'material.albedo', type: 'color' },
      { key: 'material.metallic', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'material.roughness', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'material.emissive', type: 'color' },
      { key: 'material.emissiveIntensity', type: 'number', min: 0, max: 20, step: 0.1 },
      { key: 'material.texTilingX', type: 'number', min: 0.01, max: 100, step: 0.1 },
      { key: 'material.texTilingY', type: 'number', min: 0.01, max: 100, step: 0.1 },
      { key: 'castShadow', type: 'boolean' },
    ],
  });

  registerComponent(TerrainMeshRenderer, {
    name: 'TerrainMeshRenderer',
    properties: [
      { key: 'castShadow', type: 'boolean' },
      { key: 'receiveSSAO', type: 'boolean' },
      { key: 'material.splatSharpness', type: 'number', min: 1, max: 16, step: 0.5 },
    ],
  });

  registerComponent(Camera, {
    name: 'Camera',
    properties: [
      { key: 'fovY', type: 'number', min: 0.1, max: 3.14, step: 0.01 },
      { key: 'near', type: 'number', min: 0.001, max: 100, step: 0.01 },
      { key: 'far', type: 'number', min: 1, max: 10000, step: 1 },
      { key: 'isMainCamera', type: 'boolean' },
      { key: 'clearColor', type: 'color' },
    ],
  });

  registerComponent(DirectionalLight, {
    name: 'DirectionalLight',
    properties: [
      { key: 'color', type: 'color' },
      { key: 'intensity', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'castShadows', type: 'boolean' },
      { key: 'shadowIntensity', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'shadowResolution', type: 'number', min: 256, max: 4096, step: 256 },
      { key: 'shadowSize', type: 'number', min: 1, max: 200, step: 1 },
      { key: 'shadowDistance', type: 'number', min: 10, max: 500, step: 10 },
      { key: 'shadowFarSize', type: 'number', min: 10, max: 500, step: 5 },
      { key: 'shadowFarDistance', type: 'number', min: 20, max: 1000, step: 10 },
    ],
  });

  registerComponent(PointLight, {
    name: 'PointLight',
    properties: [
      { key: 'color', type: 'color' },
      { key: 'intensity', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'range', type: 'number', min: 0.1, max: 100, step: 0.1 },
      { key: 'castShadows', type: 'boolean' },
      { key: 'shadowIntensity', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'shadowResolution', type: 'number', min: 128, max: 2048, step: 128 },
    ],
  });

  registerComponent(SpotLight, {
    name: 'SpotLight',
    properties: [
      { key: 'color', type: 'color' },
      { key: 'intensity', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'range', type: 'number', min: 0.1, max: 100, step: 0.1 },
      { key: 'innerAngle', type: 'number', min: 0, max: 1.0297, step: 0.0175 },
      { key: 'outerAngle', type: 'number', min: 0.0175, max: 1.0472, step: 0.0175 },
      { key: 'castShadows', type: 'boolean' },
      { key: 'shadowIntensity', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'shadowResolution', type: 'number', min: 256, max: 2048, step: 256 },
    ],
  });
}
