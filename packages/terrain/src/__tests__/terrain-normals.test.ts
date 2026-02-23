import { describe, it, expect } from 'vitest';
import { computeGradientNormals, computeTriangleNormals } from '../terrain-normals.js';

describe('computeGradientNormals', () => {
  it('computes upward normal for a horizontal plane', () => {
    // Density function: y - 0 (plane at y=0)
    const densityFn = (_x: number, y: number, _z: number) => y;

    // A vertex on the surface at y=0
    const verts = new Float32Array(8);
    verts[0] = 5; verts[1] = 0; verts[2] = 5; // position
    verts[3] = 0; verts[4] = 0; verts[5] = 0; // normal (zeroed)

    computeGradientNormals(verts, 1, densityFn, 0.5);

    // Should point up (0, 1, 0)
    expect(verts[3]).toBeCloseTo(0, 3);
    expect(verts[4]).toBeCloseTo(1, 3);
    expect(verts[5]).toBeCloseTo(0, 3);
  });

  it('computes outward normal for a sphere', () => {
    const densityFn = (x: number, y: number, z: number) =>
      Math.sqrt(x * x + y * y + z * z) - 5;

    // Vertex on sphere surface at (5, 0, 0)
    const verts = new Float32Array(8);
    verts[0] = 5; verts[1] = 0; verts[2] = 0;

    computeGradientNormals(verts, 1, densityFn, 0.1);

    // Should point in +X direction
    expect(verts[3]).toBeCloseTo(1, 1);
    expect(verts[4]).toBeCloseTo(0, 1);
    expect(verts[5]).toBeCloseTo(0, 1);
  });

  it('normalizes the result', () => {
    const densityFn = (x: number, y: number, _z: number) => x + y;

    const verts = new Float32Array(8);
    verts[0] = 0; verts[1] = 0; verts[2] = 0;

    computeGradientNormals(verts, 1, densityFn, 0.5);

    const nx = verts[3]!;
    const ny = verts[4]!;
    const nz = verts[5]!;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    expect(len).toBeCloseTo(1, 5);
  });
});

describe('computeTriangleNormals', () => {
  it('computes correct normal for a flat triangle', () => {
    // Triangle in XZ plane, CCW winding viewed from +Y
    const verts = new Float32Array(3 * 8);
    // v0
    verts[0] = 0; verts[1] = 0; verts[2] = 0;
    // v1
    verts[8] = 1; verts[9] = 0; verts[10] = 0;
    // v2
    verts[16] = 0; verts[17] = 0; verts[18] = 1;

    // Winding: v0→v2→v1 so cross((0,0,1)-(0,0,0), (1,0,0)-(0,0,0)) = (0,-1,0)
    // Use v0,v2,v1 for +Y normal: cross((0,0,1), (1,0,0)) won't work either.
    // Just verify: v0→v1→v2 cross = (1,0,0)×(0,0,1) = (0,-1,0). Use that.
    const indices = new Uint32Array([0, 1, 2]);

    computeTriangleNormals(verts, indices, 3, 3);

    // Cross of edge01×edge02 = (1,0,0)×(0,0,1) = (0*1-0*0, 0*0-1*1, 1*0-0*0) = (0,-1,0)
    for (let v = 0; v < 3; v++) {
      const o = v * 8;
      expect(verts[o + 3]).toBeCloseTo(0, 3);
      expect(verts[o + 4]).toBeCloseTo(-1, 3);
      expect(verts[o + 5]).toBeCloseTo(0, 3);
    }
  });

  it('averages normals for shared vertices', () => {
    // Two triangles sharing vertex 1, meeting at 90 degrees
    const verts = new Float32Array(4 * 8);
    // v0: (0,0,0)
    // v1: (1,0,0) - shared
    // v2: (0,1,0)
    // v3: (1,0,1)
    verts[0] = 0; verts[1] = 0; verts[2] = 0;
    verts[8] = 1; verts[9] = 0; verts[10] = 0;
    verts[16] = 0; verts[17] = 1; verts[18] = 0;
    verts[24] = 1; verts[25] = 0; verts[26] = 1;

    // Tri 1: v0,v1,v2 — normal should be (0,0,1)
    // Tri 2: v0,v1,v3 — normal should be (0,1,0) (cross of (1,0,0) x (1,0,1) = ... )
    const indices = new Uint32Array([0, 1, 2, 0, 3, 1]);

    computeTriangleNormals(verts, indices, 4, 6);

    // Vertex 1 (shared) should have an averaged normal
    const nx = verts[8 + 3]!;
    const ny = verts[8 + 4]!;
    const nz = verts[8 + 5]!;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    expect(len).toBeCloseTo(1, 3);
  });
});
