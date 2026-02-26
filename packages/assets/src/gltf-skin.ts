/**
 * Extract skin data from a glTF document.
 * Reads inverse bind matrices, joint node indices, parent hierarchy, and names.
 */

import type { GltfDocument } from './gltf-parser.js';
import { readAccessor } from './gltf-parser.js';
import type { ModelSkin } from './types.js';
import { Mat4 } from '@certe/atmos-math';

/**
 * Extract all skins from the glTF document.
 * Each skin maps joint nodes → inverse bind matrices + pre-computed parent chain.
 */
export function extractSkins(doc: GltfDocument): ModelSkin[] {
  const gltfSkins = doc.json.skins ?? [];
  const gltfNodes = doc.json.nodes ?? [];
  const skins: ModelSkin[] = [];

  // Build a global nodeIndex → parentNodeIndex map from glTF children arrays
  const nodeParentMap = new Map<number, number>();
  for (let ni = 0; ni < gltfNodes.length; ni++) {
    for (const childIdx of gltfNodes[ni]!.children ?? []) {
      nodeParentMap.set(childIdx, ni);
    }
  }

  for (let i = 0; i < gltfSkins.length; i++) {
    const skin = gltfSkins[i]!;
    const jointCount = skin.joints.length;

    let inverseBindMatrices: Float32Array;
    if (skin.inverseBindMatrices !== undefined) {
      const raw = readAccessor(doc, skin.inverseBindMatrices);
      if (raw instanceof Float32Array) {
        inverseBindMatrices = raw;
      } else {
        inverseBindMatrices = new Float32Array(raw.length);
        for (let j = 0; j < raw.length; j++) {
          inverseBindMatrices[j] = raw[j]!;
        }
      }
    } else {
      inverseBindMatrices = new Float32Array(jointCount * 16);
      const identity = Mat4.create();
      Mat4.identity(identity);
      for (let j = 0; j < jointCount; j++) {
        inverseBindMatrices.set(identity, j * 16);
      }
    }

    // Build a set for quick lookup: which glTF node indices are joints in this skin
    const jointNodeSet = new Set(skin.joints);

    // Compute parent joint index and rest-pose TRS for each joint
    const jointParents: number[] = [];
    const jointNames: string[] = [];
    const restT = new Float32Array(jointCount * 3);
    const restR = new Float32Array(jointCount * 4);
    const restS = new Float32Array(jointCount * 3);

    for (let ji = 0; ji < jointCount; ji++) {
      const nodeIdx = skin.joints[ji]!;
      const node = gltfNodes[nodeIdx];
      jointNames.push(node?.name ?? `joint_${ji}`);

      // Rest-pose TRS from node
      if (node?.translation) {
        restT[ji * 3] = node.translation[0] ?? 0;
        restT[ji * 3 + 1] = node.translation[1] ?? 0;
        restT[ji * 3 + 2] = node.translation[2] ?? 0;
      }
      if (node?.rotation) {
        restR[ji * 4] = node.rotation[0] ?? 0;
        restR[ji * 4 + 1] = node.rotation[1] ?? 0;
        restR[ji * 4 + 2] = node.rotation[2] ?? 0;
        restR[ji * 4 + 3] = node.rotation[3] ?? 1;
      } else {
        restR[ji * 4 + 3] = 1; // identity quaternion
      }
      if (node?.scale) {
        restS[ji * 3] = node.scale[0] ?? 1;
        restS[ji * 3 + 1] = node.scale[1] ?? 1;
        restS[ji * 3 + 2] = node.scale[2] ?? 1;
      } else {
        restS[ji * 3] = 1; restS[ji * 3 + 1] = 1; restS[ji * 3 + 2] = 1;
      }

      // Walk up the node hierarchy to find the first ancestor that's also a joint
      let current = nodeParentMap.get(nodeIdx);
      let parentJointIdx = -1;
      while (current !== undefined) {
        if (jointNodeSet.has(current)) {
          parentJointIdx = skin.joints.indexOf(current);
          break;
        }
        current = nodeParentMap.get(current);
      }
      jointParents.push(parentJointIdx);
    }

    skins.push({
      name: skin.name ?? `skin_${i}`,
      jointNodeIndices: [...skin.joints],
      inverseBindMatrices,
      jointParents,
      jointNames,
      restT,
      restR,
      restS,
    });
  }

  return skins;
}
