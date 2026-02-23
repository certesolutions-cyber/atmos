import { describe, it, expect } from 'vitest';
import { extractSurface, computeTriplanarUVs } from '../marching-cubes.js';

/** Helper: fill a density grid with a sphere SDF */
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

describe('extractSurface', () => {
  it('produces no geometry for an empty grid (all air)', () => {
    const size = 4;
    const s1 = size + 1;
    const grid = new Float32Array(s1 * s1 * s1).fill(1); // all positive = air
    const verts = new Float32Array(10000);
    const idx = new Uint32Array(10000);

    const result = extractSurface(grid, size, 1, 0, verts, idx);
    expect(result.vertexCount).toBe(0);
    expect(result.indexCount).toBe(0);
  });

  it('produces no geometry for a fully solid grid', () => {
    const size = 4;
    const s1 = size + 1;
    const grid = new Float32Array(s1 * s1 * s1).fill(-1); // all negative = solid
    const verts = new Float32Array(10000);
    const idx = new Uint32Array(10000);

    const result = extractSurface(grid, size, 1, 0, verts, idx);
    expect(result.vertexCount).toBe(0);
    expect(result.indexCount).toBe(0);
  });

  it('generates geometry for a sphere', () => {
    const size = 8;
    const grid = fillSphereGrid(size, 1, 4, 4, 4, 3);
    const verts = new Float32Array(50000 * 8);
    const idx = new Uint32Array(50000 * 3);

    const result = extractSurface(grid, size, 1, 0, verts, idx);
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.indexCount).toBeGreaterThan(0);
    // Index count must be a multiple of 3 (triangles)
    expect(result.indexCount % 3).toBe(0);
  });

  it('generates geometry for a single cube case', () => {
    // 2x2x2 grid where only corner (0,0,0) is solid
    const size = 1;
    const s1 = 2;
    const grid = new Float32Array(s1 * s1 * s1).fill(1);
    grid[0] = -1; // corner 0 is solid

    const verts = new Float32Array(1000);
    const idx = new Uint32Array(1000);

    const result = extractSurface(grid, size, 1, 0, verts, idx);
    // Case 1 (0x001): 1 triangle
    expect(result.vertexCount).toBe(3);
    expect(result.indexCount).toBe(3);
  });

  it('uses Uint32 indices', () => {
    const size = 8;
    const grid = fillSphereGrid(size, 1, 4, 4, 4, 3);
    const verts = new Float32Array(50000 * 8);
    const idx = new Uint32Array(50000 * 3);

    const result = extractSurface(grid, size, 1, 0, verts, idx);
    // Verify all indices reference valid vertices
    for (let i = 0; i < result.indexCount; i++) {
      expect(result.indices[i]).toBeLessThan(result.vertexCount);
    }
  });

  it('vertices are within grid bounds', () => {
    const size = 8;
    const voxelSize = 0.5;
    const grid = fillSphereGrid(size, voxelSize, 2, 2, 2, 1.5);
    const verts = new Float32Array(50000 * 8);
    const idx = new Uint32Array(50000 * 3);

    const result = extractSurface(grid, size, voxelSize, 0, verts, idx);
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
});

describe('computeTriplanarUVs', () => {
  it('assigns UVs based on dominant normal axis', () => {
    // A vertex with Y-dominant normal should get XZ UVs
    const verts = new Float32Array(8);
    verts[0] = 3; verts[1] = 5; verts[2] = 7; // position
    verts[3] = 0; verts[4] = 1; verts[5] = 0; // normal (Y up)
    verts[6] = 0; verts[7] = 0; // UV (will be overwritten)

    computeTriplanarUVs(verts, 1, 1);
    expect(verts[6]).toBe(3); // u = px
    expect(verts[7]).toBe(7); // v = pz
  });

  it('respects UV scale', () => {
    const verts = new Float32Array(8);
    verts[0] = 2; verts[1] = 4; verts[2] = 6;
    verts[3] = 0; verts[4] = 1; verts[5] = 0;

    computeTriplanarUVs(verts, 1, 0.5);
    expect(verts[6]).toBe(1); // 2 * 0.5
    expect(verts[7]).toBe(3); // 6 * 0.5
  });
});
