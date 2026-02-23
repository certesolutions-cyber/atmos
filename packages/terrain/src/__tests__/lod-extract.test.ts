import { describe, it, expect } from 'vitest';
import { extractSurfaceLOD } from '../lod-extract.js';
import { extractSurface } from '../marching-cubes.js';

/** Fill a density grid with a sphere SDF */
function fillSphereGrid(
  size: number, voxelSize: number,
  cx: number, cy: number, cz: number, radius: number,
): Float32Array {
  const s1 = size + 1;
  const grid = new Float32Array(s1 * s1 * s1);
  for (let z = 0; z <= size; z++) {
    for (let y = 0; y <= size; y++) {
      for (let x = 0; x <= size; x++) {
        const wx = x * voxelSize;
        const wy = y * voxelSize;
        const wz = z * voxelSize;
        const dx = wx - cx;
        const dy = wy - cy;
        const dz = wz - cz;
        grid[z * s1 * s1 + y * s1 + x] = Math.sqrt(dx * dx + dy * dy + dz * dz) - radius;
      }
    }
  }
  return grid;
}

describe('extractSurfaceLOD', () => {
  it('step=1 matches original extractSurface', () => {
    const size = 8;
    const grid = fillSphereGrid(size, 1, 4, 4, 4, 3);
    const verts1 = new Float32Array(50000 * 8);
    const idx1 = new Uint32Array(50000 * 3);
    const verts2 = new Float32Array(50000 * 8);
    const idx2 = new Uint32Array(50000 * 3);

    const original = extractSurface(grid, size, 1, 0, verts1, idx1);
    const lod = extractSurfaceLOD(grid, size, 1, 1, 0, verts2, idx2);

    expect(lod.vertexCount).toBe(original.vertexCount);
    expect(lod.indexCount).toBe(original.indexCount);
  });

  it('step=2 produces fewer vertices than step=1', () => {
    const size = 16;
    const grid = fillSphereGrid(size, 1, 8, 8, 8, 6);
    const verts1 = new Float32Array(100000 * 8);
    const idx1 = new Uint32Array(100000 * 3);
    const verts2 = new Float32Array(100000 * 8);
    const idx2 = new Uint32Array(100000 * 3);

    const full = extractSurfaceLOD(grid, size, 1, 1, 0, verts1, idx1);
    const half = extractSurfaceLOD(grid, size, 2, 1, 0, verts2, idx2);

    expect(half.vertexCount).toBeGreaterThan(0);
    expect(half.vertexCount).toBeLessThan(full.vertexCount);
    expect(half.indexCount % 3).toBe(0);
  });

  it('step=4 produces fewer vertices than step=2', () => {
    const size = 16;
    const grid = fillSphereGrid(size, 1, 8, 8, 8, 6);
    const verts1 = new Float32Array(100000 * 8);
    const idx1 = new Uint32Array(100000 * 3);
    const verts2 = new Float32Array(100000 * 8);
    const idx2 = new Uint32Array(100000 * 3);

    const half = extractSurfaceLOD(grid, size, 2, 1, 0, verts1, idx1);
    const quarter = extractSurfaceLOD(grid, size, 4, 1, 0, verts2, idx2);

    expect(quarter.vertexCount).toBeGreaterThan(0);
    expect(quarter.vertexCount).toBeLessThan(half.vertexCount);
    expect(quarter.indexCount % 3).toBe(0);
  });

  it('produces no geometry for all-air grid', () => {
    const size = 8;
    const s1 = size + 1;
    const grid = new Float32Array(s1 * s1 * s1).fill(1);
    const verts = new Float32Array(10000);
    const idx = new Uint32Array(10000);

    const result = extractSurfaceLOD(grid, size, 2, 1, 0, verts, idx);
    expect(result.vertexCount).toBe(0);
    expect(result.indexCount).toBe(0);
  });

  it('vertices are within grid bounds at step=2', () => {
    const size = 16;
    const voxelSize = 0.5;
    const grid = fillSphereGrid(size, voxelSize, 4, 4, 4, 3);
    const verts = new Float32Array(100000 * 8);
    const idx = new Uint32Array(100000 * 3);

    const result = extractSurfaceLOD(grid, size, 2, voxelSize, 0, verts, idx);
    const maxCoord = size * voxelSize;
    for (let v = 0; v < result.vertexCount; v++) {
      const o = v * 8;
      expect(verts[o]!).toBeGreaterThanOrEqual(-0.01);
      expect(verts[o]!).toBeLessThanOrEqual(maxCoord + 0.01);
      expect(verts[o + 1]!).toBeGreaterThanOrEqual(-0.01);
      expect(verts[o + 1]!).toBeLessThanOrEqual(maxCoord + 0.01);
      expect(verts[o + 2]!).toBeGreaterThanOrEqual(-0.01);
      expect(verts[o + 2]!).toBeLessThanOrEqual(maxCoord + 0.01);
    }
  });

  it('all indices reference valid vertices', () => {
    const size = 16;
    const grid = fillSphereGrid(size, 1, 8, 8, 8, 6);
    const verts = new Float32Array(100000 * 8);
    const idx = new Uint32Array(100000 * 3);

    const result = extractSurfaceLOD(grid, size, 2, 1, 0, verts, idx);
    for (let i = 0; i < result.indexCount; i++) {
      expect(result.indices[i]).toBeLessThan(result.vertexCount);
    }
  });
});
