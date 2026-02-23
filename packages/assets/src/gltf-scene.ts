/**
 * Assemble a complete ModelAsset from a glTF document.
 * Orchestrates parser, mesh, material, texture, skin, and animation extraction.
 */

import { parseGlb } from './gltf-parser.js';
import type { GltfDocument, GltfNode } from './gltf-parser.js';
import { extractMeshes } from './gltf-mesh.js';
import { extractMaterials } from './gltf-material.js';
import { extractTextures } from './gltf-texture.js';
import { extractSkins } from './gltf-skin.js';
import { extractAnimations } from './gltf-animation.js';
import type { ModelAsset, ModelNode } from './types.js';

/**
 * Parse a GLB buffer into a format-agnostic ModelAsset.
 * This is CPU-only – no GPU access needed.
 */
export function parseGltfModel(data: ArrayBuffer, name?: string): ModelAsset {
  const doc = parseGlb(data);
  return buildModelAsset(doc, name ?? 'model');
}

function buildModelAsset(doc: GltfDocument, name: string): ModelAsset {
  const meshes = extractMeshes(doc);
  const materials = extractMaterials(doc);
  const textures = extractTextures(doc);
  const skins = extractSkins(doc);
  const animations = extractAnimations(doc);
  const rootNodes = buildNodeTree(doc);

  // Propagate skin indices from nodes to meshes
  propagateSkinIndices(doc, meshes, rootNodes);

  return { name, meshes, materials, textures, rootNodes, skins, animations };
}

/**
 * Walk the node tree and propagate skin index from nodes to their meshes.
 */
function propagateSkinIndices(
  doc: GltfDocument,
  meshes: ReturnType<typeof extractMeshes>,
  _rootNodes: ModelNode[],
): void {
  const gltfNodes = doc.json.nodes ?? [];
  const meshIndexMap = buildMeshIndexMap(doc);

  for (const node of gltfNodes) {
    if (node.skin !== undefined && node.mesh !== undefined) {
      const flatIndices = meshIndexMap.get(node.mesh) ?? [];
      for (const mi of flatIndices) {
        const mesh = meshes[mi];
        if (mesh) {
          mesh.skinIndex = node.skin;
        }
      }
    }
  }
}

function buildNodeTree(doc: GltfDocument): ModelNode[] {
  const gltfNodes = doc.json.nodes ?? [];
  const sceneIndex = doc.json.scene ?? 0;
  const scene = doc.json.scenes?.[sceneIndex];
  const rootIndices = scene?.nodes ?? [];

  const meshIndexMap = buildMeshIndexMap(doc);

  return rootIndices
    .map(i => buildNode(gltfNodes, i, meshIndexMap))
    .filter((n): n is ModelNode => n !== null);
}

function buildNode(
  nodes: GltfNode[],
  index: number,
  meshIndexMap: Map<number, number[]>,
): ModelNode | null {
  const node = nodes[index];
  if (!node) return null;

  let position: [number, number, number] = [0, 0, 0];
  let rotation: [number, number, number, number] = [0, 0, 0, 1];
  let scale: [number, number, number] = [1, 1, 1];

  if (node.matrix) {
    const m = node.matrix;
    position = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
    scale = decomposeScale(m);
    rotation = decomposeRotation(m, scale);
  } else {
    if (node.translation) {
      position = [
        node.translation[0] ?? 0,
        node.translation[1] ?? 0,
        node.translation[2] ?? 0,
      ];
    }
    if (node.rotation) {
      rotation = [
        node.rotation[0] ?? 0,
        node.rotation[1] ?? 0,
        node.rotation[2] ?? 0,
        node.rotation[3] ?? 1,
      ];
    }
    if (node.scale) {
      scale = [
        node.scale[0] ?? 1,
        node.scale[1] ?? 1,
        node.scale[2] ?? 1,
      ];
    }
  }

  const meshIndices = node.mesh !== undefined
    ? (meshIndexMap.get(node.mesh) ?? [])
    : [];

  const children = (node.children ?? [])
    .map(ci => buildNode(nodes, ci, meshIndexMap))
    .filter((n): n is ModelNode => n !== null);

  const result: ModelNode = {
    name: node.name ?? `node_${index}`,
    meshIndices,
    position,
    rotation,
    scale,
    children,
  };

  if (node.skin !== undefined) {
    result.skinIndex = node.skin;
  }

  return result;
}

function buildMeshIndexMap(doc: GltfDocument): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const gltfMeshes = doc.json.meshes ?? [];
  let flatIndex = 0;

  for (let mi = 0; mi < gltfMeshes.length; mi++) {
    const primCount = gltfMeshes[mi]!.primitives.length;
    const indices: number[] = [];
    for (let p = 0; p < primCount; p++) {
      indices.push(flatIndex++);
    }
    map.set(mi, indices);
  }
  return map;
}

function decomposeScale(m: number[]): [number, number, number] {
  const sx = Math.sqrt((m[0] ?? 0) ** 2 + (m[1] ?? 0) ** 2 + (m[2] ?? 0) ** 2);
  const sy = Math.sqrt((m[4] ?? 0) ** 2 + (m[5] ?? 0) ** 2 + (m[6] ?? 0) ** 2);
  const sz = Math.sqrt((m[8] ?? 0) ** 2 + (m[9] ?? 0) ** 2 + (m[10] ?? 0) ** 2);
  return [sx, sy, sz];
}

function decomposeRotation(m: number[], s: [number, number, number]): [number, number, number, number] {
  const sx = s[0] || 1, sy = s[1] || 1, sz = s[2] || 1;
  const r00 = (m[0] ?? 0) / sx, r01 = (m[4] ?? 0) / sy, r02 = (m[8] ?? 0) / sz;
  const r10 = (m[1] ?? 0) / sx, r11 = (m[5] ?? 0) / sy, r12 = (m[9] ?? 0) / sz;
  const r20 = (m[2] ?? 0) / sx, r21 = (m[6] ?? 0) / sy, r22 = (m[10] ?? 0) / sz;

  const trace = r00 + r11 + r22;
  let x: number, y: number, z: number, w: number;

  if (trace > 0) {
    const s2 = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s2;
    x = (r21 - r12) * s2;
    y = (r02 - r20) * s2;
    z = (r10 - r01) * s2;
  } else if (r00 > r11 && r00 > r22) {
    const s2 = 2 * Math.sqrt(1 + r00 - r11 - r22);
    w = (r21 - r12) / s2;
    x = 0.25 * s2;
    y = (r01 + r10) / s2;
    z = (r02 + r20) / s2;
  } else if (r11 > r22) {
    const s2 = 2 * Math.sqrt(1 + r11 - r00 - r22);
    w = (r02 - r20) / s2;
    x = (r01 + r10) / s2;
    y = 0.25 * s2;
    z = (r12 + r21) / s2;
  } else {
    const s2 = 2 * Math.sqrt(1 + r22 - r00 - r11);
    w = (r10 - r01) / s2;
    x = (r02 + r20) / s2;
    y = (r12 + r21) / s2;
    z = 0.25 * s2;
  }

  return [x, y, z, w];
}
