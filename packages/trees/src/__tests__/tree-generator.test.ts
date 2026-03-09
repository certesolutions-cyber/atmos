import { describe, it, expect } from 'vitest';
import { generateTreeMesh } from '../tree-generator.js';
import { DEFAULT_TREE_SPECIES_CONFIG, TREE_VERTEX_STRIDE } from '../types.js';
import type { TreeSpeciesConfig } from '../types.js';

function makeConfig(overrides: Partial<TreeSpeciesConfig> = {}): TreeSpeciesConfig {
  return { ...DEFAULT_TREE_SPECIES_CONFIG, ...overrides };
}

describe('generateTreeMesh', () => {
  it('produces trunk geometry for a single F segment', () => {
    const config = makeConfig({ radialSegments: 4 });
    const mesh = generateTreeMesh('F', config);

    // 2 rings × (4+1) vertices each = 10 vertices
    expect(mesh.trunkVertices.length).toBe(10 * TREE_VERTEX_STRIDE);
    // 4 quads × 2 triangles × 3 indices = 24
    expect(mesh.trunkIndices.length).toBe(24);
    // No leaves from just F
    expect(mesh.leafVertices.length).toBe(0);
    expect(mesh.leafIndices.length).toBe(0);
  });

  it('produces more geometry for two F segments', () => {
    const config = makeConfig({ radialSegments: 4 });
    const meshOne = generateTreeMesh('F', config);
    const meshTwo = generateTreeMesh('FF', config);

    expect(meshTwo.trunkVertices.length).toBeGreaterThan(meshOne.trunkVertices.length);
    expect(meshTwo.trunkIndices.length).toBeGreaterThan(meshOne.trunkIndices.length);
  });

  it('branching produces more geometry than linear', () => {
    const config = makeConfig({ radialSegments: 4 });
    const linear = generateTreeMesh('FFF', config);
    const branched = generateTreeMesh('F[+F][-F]', config);

    expect(branched.trunkVertices.length).toBeGreaterThan(linear.trunkVertices.length);
  });

  it('windWeight is 0 at base and >0 at top', () => {
    const config = makeConfig({ radialSegments: 4 });
    const mesh = generateTreeMesh('FFF', config);

    // First ring (base) windWeight should be ~0
    const baseWindWeight = mesh.trunkVertices[8]; // index 8 = windWeight of first vertex
    expect(baseWindWeight).toBe(0);

    // Last ring windWeight should be > 0
    const lastVertexStart = mesh.trunkVertices.length - TREE_VERTEX_STRIDE;
    const topWindWeight = mesh.trunkVertices[lastVertexStart + 8];
    expect(topWindWeight).toBeGreaterThan(0);
  });

  it('normals are approximately unit length', () => {
    const config = makeConfig({ radialSegments: 6 });
    const mesh = generateTreeMesh('FF', config);

    for (let i = 0; i < mesh.trunkVertices.length; i += TREE_VERTEX_STRIDE) {
      const nx = mesh.trunkVertices[i + 3]!;
      const ny = mesh.trunkVertices[i + 4]!;
      const nz = mesh.trunkVertices[i + 5]!;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1.0, 1);
    }
  });

  it('generates leaf geometry for L symbols', () => {
    const config = makeConfig({ leafCount: 2 });
    const mesh = generateTreeMesh('FL', config);

    // 2 leaves × 4 vertices = 8 vertices
    expect(mesh.leafVertices.length).toBe(8 * TREE_VERTEX_STRIDE);
    // 2 leaves × 2 triangles × 3 indices = 12
    expect(mesh.leafIndices.length).toBe(12);
  });

  it('leaf windWeight and branchLevel match parent branch', () => {
    const config = makeConfig({ leafCount: 1 });
    // 'FL' at depth 0: windWeight = posY/maxY, branchLevel = 0/maxDepth = 0
    const mesh = generateTreeMesh('FL', config);

    for (let i = 0; i < mesh.leafVertices.length; i += TREE_VERTEX_STRIDE) {
      const windWeight = mesh.leafVertices[i + 8];
      const branchLevel = mesh.leafVertices[i + 9];
      // At depth 0 after one F, windWeight should be ~1.0 (posY ≈ maxY)
      expect(windWeight).toBeGreaterThan(0);
      expect(windWeight).toBeLessThanOrEqual(1.0);
      // branchLevel = depth/maxDepth = 0/1 = 0 (no branching in 'FL')
      expect(branchLevel).toBe(0);
    }
  });

  it('produces no geometry for empty string', () => {
    const config = makeConfig();
    const mesh = generateTreeMesh('', config);
    expect(mesh.trunkVertices.length).toBe(0);
    expect(mesh.trunkIndices.length).toBe(0);
  });

  it('produces deterministic output with same config', () => {
    const config = makeConfig({ curvature: 0.1 });
    const a = generateTreeMesh('F[+FF][-FF]', config);
    const b = generateTreeMesh('F[+FF][-FF]', config);

    expect(a.trunkVertices).toEqual(b.trunkVertices);
    expect(a.trunkIndices).toEqual(b.trunkIndices);
  });
});
