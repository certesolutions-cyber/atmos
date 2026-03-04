/**
 * Register clipmap terrain components with the component registry.
 */

import { registerComponent } from '@certe/atmos-core';
import { ClipmapTerrain } from './clipmap-terrain.js';

export function registerClipmapTerrainBuiltins(): void {
  registerComponent(ClipmapTerrain, {
    name: 'ClipmapTerrain',
    properties: [
      { key: 'config.gridSize', type: 'number', min: 7, max: 127, step: 2 },
      { key: 'config.cellSize', type: 'number', min: 0.1, max: 10, step: 0.1 },
      { key: 'config.levels', type: 'number', min: 1, max: 10, step: 1 },
      { key: 'config.heightmapResolution', type: 'number', min: 128, max: 4096, step: 128 },
      { key: 'config.heightmapWorldSize', type: 'number', min: 64, max: 16384, step: 64 },
      { key: 'castShadow', type: 'boolean' },
      { key: 'receiveSSAO', type: 'boolean' },
    ],
  });
}
