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
      // Material
      { key: 'albedo', type: 'color', label: 'Albedo Color' },
      { key: 'roughness', type: 'number', min: 0, max: 1, step: 0.05, label: 'Roughness' },
      { key: 'metallic', type: 'number', min: 0, max: 1, step: 0.05, label: 'Metallic' },
      // Layer 0 (base / default)
      { key: 'layer0Albedo', type: 'texture', label: 'Layer 0 Albedo' },
      { key: 'layer0Normal', type: 'texture', label: 'Layer 0 Normal' },
      { key: 'layer0Tiling', type: 'number', min: 0.1, max: 100, step: 0.5, label: 'Layer 0 Tiling' },
      // Layer 1
      { key: 'layer1Albedo', type: 'texture', label: 'Layer 1 Albedo' },
      { key: 'layer1Normal', type: 'texture', label: 'Layer 1 Normal' },
      { key: 'layer1Tiling', type: 'number', min: 0.1, max: 100, step: 0.5, label: 'Layer 1 Tiling' },
      // Layer 2
      { key: 'layer2Albedo', type: 'texture', label: 'Layer 2 Albedo' },
      { key: 'layer2Normal', type: 'texture', label: 'Layer 2 Normal' },
      { key: 'layer2Tiling', type: 'number', min: 0.1, max: 100, step: 0.5, label: 'Layer 2 Tiling' },
      // Layer 3
      { key: 'layer3Albedo', type: 'texture', label: 'Layer 3 Albedo' },
      { key: 'layer3Normal', type: 'texture', label: 'Layer 3 Normal' },
      { key: 'layer3Tiling', type: 'number', min: 0.1, max: 100, step: 0.5, label: 'Layer 3 Tiling' },
    ],
  });
}
