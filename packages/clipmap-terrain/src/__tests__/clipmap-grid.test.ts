import { describe, it, expect } from 'vitest';
import { createFullGrid, createRingGrid } from '../clipmap-grid.js';

describe('createFullGrid', () => {
  it('produces correct vertex count for gridSize=9', () => {
    const grid = createFullGrid(9, false);
    expect(grid.vertexCount).toBe(81); // 9 * 9
    expect(grid.vertices.length).toBe(81 * 2);
  });

  it('produces correct index count for gridSize=9 (no stitch)', () => {
    const grid = createFullGrid(9, false);
    const cellsPerSide = 8;
    expect(grid.indexCount).toBe(cellsPerSide * cellsPerSide * 6);
  });

  it('centers grid coordinates around 0', () => {
    const grid = createFullGrid(5, false);
    // Half = (5-1)/2 = 2, so coords range from -2 to +2
    expect(grid.vertices[0]).toBe(-2);
    expect(grid.vertices[1]).toBe(-2);
    expect(grid.vertices[(25 - 1) * 2]).toBe(2);
    expect(grid.vertices[(25 - 1) * 2 + 1]).toBe(2);
  });

  it('uses CCW winding for triangles (no stitch)', () => {
    const grid = createFullGrid(3, false);
    // First cell (top-left): tl=0, tr=1, bl=3, br=4
    expect(grid.indices[0]).toBe(0);
    expect(grid.indices[1]).toBe(3);
    expect(grid.indices[2]).toBe(1);
    expect(grid.indices[3]).toBe(1);
    expect(grid.indices[4]).toBe(3);
    expect(grid.indices[5]).toBe(4);
  });

  it('handles gridSize=65 (default)', () => {
    const grid = createFullGrid(65, false);
    expect(grid.vertexCount).toBe(65 * 65);
    expect(grid.indexCount).toBe(64 * 64 * 6);
  });
});

describe('createFullGrid (stitched)', () => {
  it('has same vertex count as unstitched', () => {
    const stitched = createFullGrid(9, true);
    const unstitched = createFullGrid(9, false);
    expect(stitched.vertexCount).toBe(unstitched.vertexCount);
  });

  it('has fewer indices than unstitched (boundary pairs produce 3 tris not 4)', () => {
    const stitched = createFullGrid(9, true);
    const unstitched = createFullGrid(9, false);
    expect(stitched.indexCount).toBeLessThan(unstitched.indexCount);
  });

  it('all indices are valid vertex references', () => {
    const grid = createFullGrid(9, true);
    for (let i = 0; i < grid.indexCount; i++) {
      expect(grid.indices[i]).toBeLessThan(grid.vertexCount);
      expect(grid.indices[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('outer edge uses only even-indexed vertices (gridSize=9, 4k+1)', () => {
    // gridSize=9, half=4 (even). Even indices → even grid coords → aligns with coarser.
    const grid = createFullGrid(9, true);
    const topRowVertices = new Set<number>();
    for (let i = 0; i < grid.indexCount; i += 3) {
      const tri = [grid.indices[i]!, grid.indices[i + 1]!, grid.indices[i + 2]!];
      for (const idx of tri) {
        const z = Math.floor(idx / 9);
        if (z === 0) topRowVertices.add(idx);
      }
    }
    // Even x indices: 0, 2, 4, 6, 8 → grid coords: -4, -2, 0, 2, 4 (all even)
    for (const idx of topRowVertices) {
      const x = idx % 9;
      expect(x % 2).toBe(0);
    }
  });

  it('stitch is default (no second argument)', () => {
    const defaultGrid = createFullGrid(9);
    const stitchedGrid = createFullGrid(9, true);
    expect(defaultGrid.indexCount).toBe(stitchedGrid.indexCount);
  });

  it('stitched outer-edge vertex coords are even (world-space alignment)', () => {
    // gridSize=65, half=32. Even indices → even grid coords
    const grid = createFullGrid(65, true);
    const topRowVertices = new Set<number>();
    for (let i = 0; i < grid.indexCount; i += 3) {
      const tri = [grid.indices[i]!, grid.indices[i + 1]!, grid.indices[i + 2]!];
      for (const idx of tri) {
        const z = Math.floor(idx / 65);
        if (z === 0) topRowVertices.add(idx);
      }
    }
    for (const idx of topRowVertices) {
      const x = idx % 65;
      // grid coord = x - 32; should be even
      expect(Math.abs((x - 32) % 2)).toBe(0);
    }
  });
});

describe('createRingGrid', () => {
  it('has same vertex count as full grid', () => {
    const ring = createRingGrid(9, false);
    expect(ring.vertexCount).toBe(81);
  });

  it('has fewer indices than full grid (hole cut out)', () => {
    const full = createFullGrid(65, false);
    const ring = createRingGrid(65, false);
    expect(ring.indexCount).toBeLessThan(full.indexCount);
  });

  it('cuts out correct hole for gridSize=9 (no stitch)', () => {
    // gridSize=9, half=4, holeHalf=floor(8/4)-1=1
    // holeMin=4-1=3, holeMax=4+1=5 → 2 cells per side
    const ring = createRingGrid(9, false);
    const cellsPerSide = 8;
    const totalCells = cellsPerSide * cellsPerSide;
    const holeCells = 2 * 2;
    expect(ring.indexCount).toBe((totalCells - holeCells) * 6);
  });

  it('cuts out correct hole for gridSize=65 (no stitch)', () => {
    const ring = createRingGrid(65, false);
    // half=32, holeHalf=floor(64/4)-1=15
    // holeMin=32-15=17, holeMax=32+15=47 → 30 cells per side
    const cellsPerSide = 64;
    const totalCells = cellsPerSide * cellsPerSide;
    const holeCells = 30 * 30;
    expect(ring.indexCount).toBe((totalCells - holeCells) * 6);
  });

  it('all indices are valid vertex references', () => {
    const ring = createRingGrid(9, false);
    for (let i = 0; i < ring.indexCount; i++) {
      expect(ring.indices[i]).toBeLessThan(ring.vertexCount);
      expect(ring.indices[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('ring and full grid share same vertex positions', () => {
    const full = createFullGrid(9, false);
    const ring = createRingGrid(9, false);
    expect(ring.vertices).toEqual(full.vertices);
  });
});

describe('createRingGrid (stitched)', () => {
  it('has fewer indices than unstitched ring', () => {
    const stitched = createRingGrid(65, true);
    const unstitched = createRingGrid(65, false);
    expect(stitched.indexCount).toBeLessThan(unstitched.indexCount);
  });

  it('all indices are valid vertex references', () => {
    const ring = createRingGrid(65, true);
    for (let i = 0; i < ring.indexCount; i++) {
      expect(ring.indices[i]).toBeLessThan(ring.vertexCount);
      expect(ring.indices[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('stitch is default (no second argument)', () => {
    const defaultRing = createRingGrid(65);
    const stitchedRing = createRingGrid(65, true);
    expect(defaultRing.indexCount).toBe(stitchedRing.indexCount);
  });

  it('outer edge uses only even-indexed vertices (gridSize=9)', () => {
    const ring = createRingGrid(9, true);
    const topRowVertices = new Set<number>();
    for (let i = 0; i < ring.indexCount; i += 3) {
      const tri = [ring.indices[i]!, ring.indices[i + 1]!, ring.indices[i + 2]!];
      for (const idx of tri) {
        const z = Math.floor(idx / 9);
        if (z === 0) topRowVertices.add(idx);
      }
    }
    for (const idx of topRowVertices) {
      const x = idx % 9;
      expect(x % 2).toBe(0);
    }
  });
});
