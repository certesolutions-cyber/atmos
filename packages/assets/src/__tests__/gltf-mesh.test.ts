import { describe, it, expect } from 'vitest';
import { parseGlb } from '../gltf-parser.js';
import { extractMeshes } from '../gltf-mesh.js';
import { createTriangleGlb, buildGlb } from './glb-helpers.js';
import type { GltfJson } from '../gltf-parser.js';

describe('extractMeshes', () => {
  it('extracts a single triangle mesh', () => {
    const doc = parseGlb(createTriangleGlb());
    const meshes = extractMeshes(doc);

    expect(meshes.length).toBe(1);
    expect(meshes[0]!.name).toBe('Triangle');
    expect(meshes[0]!.materialIndex).toBe(0);
  });

  it('interleaves vertices in 32-byte format', () => {
    const doc = parseGlb(createTriangleGlb());
    const meshes = extractMeshes(doc);
    const geo = meshes[0]!.geometry;

    // 3 vertices * 8 floats = 24 floats
    expect(geo.vertices.length).toBe(24);

    // First vertex: pos(0,0,0) + normal(0,0,1) + uv(0,0)
    expect(geo.vertices[0]).toBe(0);
    expect(geo.vertices[1]).toBe(0);
    expect(geo.vertices[2]).toBe(0);
    expect(geo.vertices[3]).toBe(0);
    expect(geo.vertices[4]).toBe(0);
    expect(geo.vertices[5]).toBe(1);
    expect(geo.vertices[6]).toBe(0);
    expect(geo.vertices[7]).toBe(0);

    // Second vertex: pos(1,0,0)
    expect(geo.vertices[8]).toBe(1);
    expect(geo.vertices[9]).toBe(0);
    expect(geo.vertices[10]).toBe(0);
  });

  it('produces correct indices', () => {
    const doc = parseGlb(createTriangleGlb());
    const geo = extractMeshes(doc)[0]!.geometry;

    expect(geo.indices.length).toBe(3);
    expect(geo.indices[0]).toBe(0);
    expect(geo.indices[1]).toBe(1);
    expect(geo.indices[2]).toBe(2);
  });

  it('computes bounding sphere', () => {
    const doc = parseGlb(createTriangleGlb());
    const geo = extractMeshes(doc)[0]!.geometry;

    expect(geo.bounds).toBeDefined();
    expect(geo.bounds.radius).toBeGreaterThan(0);
  });

  it('generates flat normals when NORMAL attribute is missing', () => {
    // Build a GLB with only positions and indices, no normals
    const binSize = 36 + 8; // positions(36) + indices(8 with pad)
    const bin = new ArrayBuffer(binSize);
    const f32 = new Float32Array(bin);
    const u16 = new Uint16Array(bin);

    // Triangle in XY plane
    f32[0] = 0; f32[1] = 0; f32[2] = 0;
    f32[3] = 1; f32[4] = 0; f32[5] = 0;
    f32[6] = 0; f32[7] = 1; f32[8] = 0;
    u16[18] = 0; u16[19] = 1; u16[20] = 2;

    const json: GltfJson = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: binSize }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      meshes: [{
        name: 'NoNormals',
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
        }],
      }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    };

    const doc = parseGlb(buildGlb(json, bin));
    const meshes = extractMeshes(doc);

    expect(meshes.length).toBe(1);
    // Normals should be generated (z-up for XY triangle)
    const geo = meshes[0]!.geometry;
    // Normal is at offset 3,4,5 of each vertex
    expect(geo.vertices[5]).toBeCloseTo(1, 3); // z component of normal
  });
});
