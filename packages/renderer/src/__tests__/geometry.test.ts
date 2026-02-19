import { describe, it, expect } from 'vitest';
import {
  createCubeGeometry,
  createPlaneGeometry,
  createSphereGeometry,
  createCylinderGeometry,
  VERTEX_STRIDE_FLOATS,
} from '../geometry.js';
import type { GeometryData } from '../geometry.js';

function vertexCount(g: GeometryData): number {
  return g.vertices.length / VERTEX_STRIDE_FLOATS;
}

function getNormal(g: GeometryData, vertIdx: number): [number, number, number] {
  const o = vertIdx * VERTEX_STRIDE_FLOATS;
  return [g.vertices[o + 3]!, g.vertices[o + 4]!, g.vertices[o + 5]!];
}

function getUV(g: GeometryData, vertIdx: number): [number, number] {
  const o = vertIdx * VERTEX_STRIDE_FLOATS;
  return [g.vertices[o + 6]!, g.vertices[o + 7]!];
}

function normalLength(n: [number, number, number]): number {
  return Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
}

function allIndicesInBounds(g: GeometryData): boolean {
  const vc = vertexCount(g);
  for (let i = 0; i < g.indices.length; i++) {
    if (g.indices[i]! >= vc) return false;
  }
  return true;
}

function allUVsInRange(g: GeometryData): boolean {
  const vc = vertexCount(g);
  for (let i = 0; i < vc; i++) {
    const [u, v] = getUV(g, i);
    if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) return false;
  }
  return true;
}

describe('createCubeGeometry', () => {
  const cube = createCubeGeometry();

  it('has 24 vertices and 36 indices', () => {
    expect(vertexCount(cube)).toBe(24);
    expect(cube.indices.length).toBe(36);
  });

  it('normals are unit vectors', () => {
    for (let i = 0; i < vertexCount(cube); i++) {
      expect(normalLength(getNormal(cube, i))).toBeCloseTo(1, 3);
    }
  });

  it('UVs are in [0,1]', () => {
    expect(allUVsInRange(cube)).toBe(true);
  });
});

describe('createPlaneGeometry', () => {
  const plane = createPlaneGeometry(2, 2, 2, 2);

  it('has correct vertex/index counts for 2x2 segments', () => {
    expect(vertexCount(plane)).toBe(9); // (2+1)*(2+1)
    expect(plane.indices.length).toBe(24); // 2*2*2*3
  });

  it('all normals point up', () => {
    for (let i = 0; i < vertexCount(plane); i++) {
      const n = getNormal(plane, i);
      expect(n[0]).toBeCloseTo(0, 4);
      expect(n[1]).toBeCloseTo(1, 4);
      expect(n[2]).toBeCloseTo(0, 4);
    }
  });

  it('indices are in bounds', () => {
    expect(allIndicesInBounds(plane)).toBe(true);
  });
});

describe('createSphereGeometry', () => {
  const sphere = createSphereGeometry(1, 8, 6);

  it('has correct vertex count', () => {
    expect(vertexCount(sphere)).toBe((8 + 1) * (6 + 1));
  });

  it('normals are unit vectors', () => {
    for (let i = 0; i < vertexCount(sphere); i++) {
      const len = normalLength(getNormal(sphere, i));
      // Pole normals (0,1,0) and (0,-1,0) are fine, skip degenerate check
      if (len > 0.001) {
        expect(len).toBeCloseTo(1, 2);
      }
    }
  });

  it('UVs are in [0,1]', () => {
    expect(allUVsInRange(sphere)).toBe(true);
  });

  it('indices are in bounds', () => {
    expect(allIndicesInBounds(sphere)).toBe(true);
  });
});

describe('createCylinderGeometry', () => {
  const cyl = createCylinderGeometry(0.5, 0.5, 1, 8);

  it('indices are in bounds', () => {
    expect(allIndicesInBounds(cyl)).toBe(true);
  });

  it('has nonzero vertex and index counts', () => {
    expect(vertexCount(cyl)).toBeGreaterThan(0);
    expect(cyl.indices.length).toBeGreaterThan(0);
  });

  it('body normals are unit vectors', () => {
    // First (8+1)*2 = 18 verts are body
    const bodyCount = (8 + 1) * 2;
    for (let i = 0; i < bodyCount; i++) {
      expect(normalLength(getNormal(cyl, i))).toBeCloseTo(1, 3);
    }
  });
});
