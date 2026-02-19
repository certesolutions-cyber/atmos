import { describe, it, expect } from 'vitest';
import { parseGlb } from '../gltf-parser.js';
import { extractMaterials } from '../gltf-material.js';
import { createTriangleGlb, buildGlb } from './glb-helpers.js';
import type { GltfJson } from '../gltf-parser.js';

describe('extractMaterials', () => {
  it('extracts PBR material properties', () => {
    const doc = parseGlb(createTriangleGlb());
    const materials = extractMaterials(doc);

    expect(materials.length).toBe(1);
    expect(materials[0]!.name).toBe('Red');
    expect(materials[0]!.params.albedo).toEqual([1, 0, 0, 1]);
    expect(materials[0]!.params.metallic).toBe(0);
    expect(materials[0]!.params.roughness).toBe(0.8);
    expect(materials[0]!.albedoTextureIndex).toBeNull();
  });

  it('provides default material when none defined', () => {
    const json: GltfJson = {
      asset: { version: '2.0' },
    };
    const doc = parseGlb(buildGlb(json));
    const materials = extractMaterials(doc);

    expect(materials.length).toBe(1);
    expect(materials[0]!.name).toBe('default');
    expect(materials[0]!.params.albedo).toEqual([1, 1, 1, 1]);
  });

  it('resolves albedo texture index through texture → image', () => {
    const json: GltfJson = {
      asset: { version: '2.0' },
      images: [{ mimeType: 'image/png', bufferView: 0 }],
      textures: [{ source: 0 }],
      materials: [{
        name: 'Textured',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          baseColorFactor: [1, 1, 1, 1],
        },
      }],
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
    };

    const bin = new ArrayBuffer(4);
    const doc = parseGlb(buildGlb(json, bin));
    const materials = extractMaterials(doc);

    expect(materials[0]!.albedoTextureIndex).toBe(0);
  });

  it('uses default values when PBR fields are missing', () => {
    const json: GltfJson = {
      asset: { version: '2.0' },
      materials: [{ name: 'Bare' }],
    };
    const doc = parseGlb(buildGlb(json));
    const materials = extractMaterials(doc);

    expect(materials[0]!.params.albedo).toEqual([1, 1, 1, 1]);
    expect(materials[0]!.params.metallic).toBe(0);
    expect(materials[0]!.params.roughness).toBe(0.5);
  });
});
