/**
 * Extract materials from a glTF document.
 * Maps PBR metallic-roughness to engine MaterialParams.
 */

import type { GltfDocument } from './gltf-parser.js';
import type { ModelMaterial } from './types.js';

/** Extract all materials from the document. */
export function extractMaterials(doc: GltfDocument): ModelMaterial[] {
  const gltfMaterials = doc.json.materials ?? [];
  if (gltfMaterials.length === 0) {
    // Default material when none defined
    return [{
      name: 'default',
      params: { albedo: [1, 1, 1, 1], metallic: 0, roughness: 0.5 },
      albedoTextureIndex: null,
    }];
  }

  return gltfMaterials.map((gltfMat, i) => {
    const pbr = gltfMat.pbrMetallicRoughness;
    const baseColor = pbr?.baseColorFactor ?? [1, 1, 1, 1];

    // Resolve texture: glTF material → texture → image source index
    let albedoTextureIndex: number | null = null;
    const texInfo = pbr?.baseColorTexture;
    if (texInfo !== undefined) {
      const gltfTex = doc.json.textures?.[texInfo.index];
      if (gltfTex?.source !== undefined) {
        albedoTextureIndex = gltfTex.source;
      }
    }

    return {
      name: gltfMat.name ?? `material_${i}`,
      params: {
        albedo: [
          baseColor[0] ?? 1,
          baseColor[1] ?? 1,
          baseColor[2] ?? 1,
          baseColor[3] ?? 1,
        ] as [number, number, number, number],
        metallic: pbr?.metallicFactor ?? 0,
        roughness: pbr?.roughnessFactor ?? 0.5,
      },
      albedoTextureIndex,
    };
  });
}
