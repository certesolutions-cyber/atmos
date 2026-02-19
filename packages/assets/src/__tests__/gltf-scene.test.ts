import { describe, it, expect } from 'vitest';
import { parseGltfModel } from '../gltf-scene.js';
import { createTriangleGlb, buildGlb } from './glb-helpers.js';
import type { GltfJson } from '../gltf-parser.js';

describe('parseGltfModel', () => {
  it('produces a complete ModelAsset from a triangle GLB', () => {
    const glb = createTriangleGlb();
    const asset = parseGltfModel(glb, 'TestTriangle');

    expect(asset.name).toBe('TestTriangle');
    expect(asset.meshes.length).toBe(1);
    expect(asset.materials.length).toBe(1);
    expect(asset.rootNodes.length).toBe(1);
  });

  it('builds correct node hierarchy', () => {
    const glb = createTriangleGlb();
    const asset = parseGltfModel(glb);
    const root = asset.rootNodes[0]!;

    expect(root.name).toBe('TriangleNode');
    expect(root.meshIndices).toEqual([0]);
    expect(root.position).toEqual([0, 0, 0]);
    expect(root.rotation).toEqual([0, 0, 0, 1]);
    expect(root.scale).toEqual([1, 1, 1]);
  });

  it('handles node with translation/rotation/scale', () => {
    const binSize = 36 + 8;
    const bin = new ArrayBuffer(binSize);
    const f32 = new Float32Array(bin);
    const u16 = new Uint16Array(bin);
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
        primitives: [{ attributes: { POSITION: 0 }, indices: 1 }],
      }],
      nodes: [{
        name: 'Offset',
        mesh: 0,
        translation: [1, 2, 3],
        rotation: [0, 0.707, 0, 0.707],
        scale: [2, 2, 2],
      }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    };

    const asset = parseGltfModel(buildGlb(json, bin));
    const root = asset.rootNodes[0]!;

    expect(root.position).toEqual([1, 2, 3]);
    expect(root.rotation[1]).toBeCloseTo(0.707, 2);
    expect(root.scale).toEqual([2, 2, 2]);
  });

  it('handles parent-child node hierarchy', () => {
    const binSize = 36 + 8;
    const bin = new ArrayBuffer(binSize);
    const f32 = new Float32Array(bin);
    const u16 = new Uint16Array(bin);
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
        primitives: [{ attributes: { POSITION: 0 }, indices: 1 }],
      }],
      nodes: [
        { name: 'Parent', children: [1] },
        { name: 'Child', mesh: 0 },
      ],
      scenes: [{ nodes: [0] }],
      scene: 0,
    };

    const asset = parseGltfModel(buildGlb(json, bin));
    expect(asset.rootNodes.length).toBe(1);

    const parent = asset.rootNodes[0]!;
    expect(parent.name).toBe('Parent');
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]!.name).toBe('Child');
    expect(parent.children[0]!.meshIndices).toEqual([0]);
  });
});
