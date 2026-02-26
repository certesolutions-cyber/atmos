import { registerComponent } from '@certe/atmos-core';
import { TerrainVolume } from './terrain-volume.js';
import { TerrainWorld } from './terrain-world.js';

export function registerTerrainBuiltins(): void {
  registerComponent(TerrainVolume, {
    name: 'TerrainVolume',
    properties: [
      { key: 'chunksX', type: 'number', min: 1, max: 32, step: 1 },
      { key: 'chunksY', type: 'number', min: 1, max: 32, step: 1 },
      { key: 'chunksZ', type: 'number', min: 1, max: 32, step: 1 },
      { key: 'config.chunkSize', type: 'number', min: 4, max: 64, step: 1 },
      { key: 'config.voxelSize', type: 'number', min: 0.1, max: 10, step: 0.1 },
      { key: 'config.isoLevel', type: 'number', min: -10, max: 10, step: 0.01 },
      { key: 'config.smoothNormals', type: 'boolean' },
    ],
  });

  registerComponent(TerrainWorld, {
    name: 'TerrainWorld',
    properties: [
      { key: 'loadRadius', type: 'number', min: 1, max: 16, step: 1 },
      { key: 'unloadRadius', type: 'number', min: 2, max: 24, step: 1 },
      { key: 'maxBuildsPerFrame', type: 'number', min: 1, max: 16, step: 1 },
      { key: 'buildBudgetMs', type: 'number', min: 1, max: 32, step: 1 },
      { key: 'config.chunkSize', type: 'number', min: 4, max: 64, step: 1 },
      { key: 'config.voxelSize', type: 'number', min: 0.1, max: 10, step: 0.1 },
      { key: 'config.isoLevel', type: 'number', min: -10, max: 10, step: 0.01 },
      { key: 'config.smoothNormals', type: 'boolean' },
      { key: 'cameraTarget', type: 'gameObjectRef' },
      { key: 'lodConfig.lodDistances.0', type: 'number', min: 1, max: 16, step: 1 },
      { key: 'lodConfig.lodDistances.1', type: 'number', min: 2, max: 24, step: 1 },
    ],
  });
}
