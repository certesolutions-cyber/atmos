/**
 * ProceduralTerrain: initializes a clipmap terrain with layered noise.
 *
 * Deferred init pattern — waits for RenderSystem.current in onRender()
 * so the script can be added before the engine starts.
 */

import { Component } from '@certe/atmos-core';
import { RenderSystem, createMaterial } from '@certe/atmos-renderer';
import {
  ClipmapTerrain,
  createClipmapPipeline,
} from '@certe/atmos-clipmap-terrain';
import type { ClipmapPipelineResources } from '@certe/atmos-clipmap-terrain';

// Simple value noise (hash-based, no deps)
function hash(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263 + 1376312589) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  // Hermite smoothstep
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);

  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);

  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, z * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value / maxAmp;
}

export function terrainHeight(x: number, z: number): number {
  // Large rolling hills
  const hills = fbm(x * 0.003, z * 0.003, 6) * 80;
  // Medium ridges
  const ridges = (1.0 - Math.abs(fbm(x * 0.01, z * 0.01, 4) * 2 - 1)) * 25;
  // Fine detail
  const detail = fbm(x * 0.05, z * 0.05, 3) * 3;

  return hills + ridges + detail - 40;
}

export class ProceduralTerrain extends Component {
  private _initialized = false;
  private _pipeline: ClipmapPipelineResources | null = null;

  onRender(): void {
    if (this._initialized) return;
    const rs = RenderSystem.current;
    if (!rs) return;

    // If terrain already exists (deserialized from scene), just provide the height function
    const existing = this.gameObject.getComponent(ClipmapTerrain);
    if (existing?.initialized) {
      this._initialized = true;
      existing.updateHeightmap(terrainHeight);
      return;
    }

    this._initialized = true;

    const device = rs.device;
    this._pipeline = createClipmapPipeline(device);

    const terrain = existing ?? this.gameObject.addComponent(ClipmapTerrain);

    terrain.init(device, this._pipeline, {
      heightFn: terrainHeight,
      config: {
        gridSize: 65,
        cellSize: 1,
        levels: 6,
        heightmapResolution: 1024,
        heightmapWorldSize: 2048,
      },
    });
  }
}
