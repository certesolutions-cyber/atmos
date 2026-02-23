import type { TerrainChunk } from './chunk.js';
import { chunkKey } from './chunk-key.js';
import type { TerrainEdit } from './types.js';
import { BrushShape } from './types.js';

/**
 * Apply a terrain edit to a set of chunks.
 * Modifies density grid values in affected chunks and returns
 * the set of dirty chunk keys that need re-meshing.
 *
 * @param edit The edit operation to apply
 * @param chunks Map of chunk key → TerrainChunk
 * @param chunkSize Voxels per chunk axis
 * @param voxelSize World-space size of each voxel
 * @returns Set of chunk keys whose density grids were modified
 */
export function applyEdit(
  edit: TerrainEdit,
  chunks: Map<number, TerrainChunk>,
  chunkSize: number,
  voxelSize: number,
): Set<number> {
  const dirty = new Set<number>();
  const chunkWorldSize = chunkSize * voxelSize;
  const s1 = chunkSize + 1;
  const s1s1 = s1 * s1;

  // Determine which chunks the brush can affect
  const minCX = Math.floor((edit.x - edit.radius) / chunkWorldSize);
  const maxCX = Math.floor((edit.x + edit.radius) / chunkWorldSize);
  const minCY = Math.floor((edit.y - edit.radius) / chunkWorldSize);
  const maxCY = Math.floor((edit.y + edit.radius) / chunkWorldSize);
  const minCZ = Math.floor((edit.z - edit.radius) / chunkWorldSize);
  const maxCZ = Math.floor((edit.z + edit.radius) / chunkWorldSize);

  for (let cz = minCZ; cz <= maxCZ; cz++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = chunkKey(cx, cy, cz);
        const chunk = chunks.get(key);
        if (!chunk) continue;

        const originX = cx * chunkWorldSize;
        const originY = cy * chunkWorldSize;
        const originZ = cz * chunkWorldSize;
        let modified = false;

        for (let z = 0; z <= chunkSize; z++) {
          for (let y = 0; y <= chunkSize; y++) {
            for (let x = 0; x <= chunkSize; x++) {
              const wx = originX + x * voxelSize;
              const wy = originY + y * voxelSize;
              const wz = originZ + z * voxelSize;

              const weight = brushWeight(edit, wx, wy, wz);
              if (weight <= 0) continue;

              const idx = z * s1s1 + y * s1 + x;
              chunk.densityGrid[idx] = chunk.densityGrid[idx]! + edit.strength * weight;
              modified = true;
            }
          }
        }

        if (modified) {
          dirty.add(key);
        }
      }
    }
  }

  return dirty;
}

/** Compute brush influence weight at a world position (0 = no effect, 1 = full). */
function brushWeight(edit: TerrainEdit, wx: number, wy: number, wz: number): number {
  const dx = wx - edit.x;
  const dy = wy - edit.y;
  const dz = wz - edit.z;

  let dist: number;
  if (edit.shape === BrushShape.Sphere) {
    dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  } else {
    // Cube: Chebyshev distance
    dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  }

  if (dist > edit.radius) return 0;

  if (edit.falloff <= 0) return 1;

  // Smooth falloff: starts at (1 - falloff) * radius
  const innerRadius = edit.radius * (1 - edit.falloff);
  if (dist <= innerRadius) return 1;

  const t = (dist - innerRadius) / (edit.radius - innerRadius);
  // Smoothstep
  return 1 - t * t * (3 - 2 * t);
}
