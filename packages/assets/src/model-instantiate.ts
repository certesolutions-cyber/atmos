/**
 * Instantiate a ModelAsset into the engine's GameObject hierarchy.
 * Uploads textures to the GPU and creates Meshes + Materials + MeshRenderers.
 * Supports skeletal animation via SkinnedMeshRenderer + AnimationMixer.
 */

import { GameObject } from '@atmos/core';
import {
  createMesh,
  createMaterial,
  createTextureFromRGBA,
  decodeImageToRGBA,
  MeshRenderer,
  SkinnedMeshRenderer,
  SKINNED_VERTEX_STRIDE_FLOATS,
} from '@atmos/renderer';
import type { Mesh, Material, GPUTextureHandle, MeshRendererContext, SkinnedRendererContext } from '@atmos/renderer';
import {
  AnimationMixer,
  AnimationHandler,
  createSkeleton,
  createAnimationClip,
} from '@atmos/animation';
import type { Joint, KeyframeTrack, AnimationChannel } from '@atmos/animation';
import type { ModelAsset, ModelNode } from './types.js';

/** Minimal interface so callers can pass a RenderSystem without importing it. */
export interface InstantiateContext extends MeshRendererContext, SkinnedRendererContext {}

export interface InstantiateOptions {
  renderSystem: InstantiateContext;
}

/**
 * Create a GameObject tree from a ModelAsset.
 * Decodes and uploads textures, creates GPU meshes and materials.
 * Automatically sets up SkinnedMeshRenderer + AnimationMixer for skinned models.
 * Returns the root GameObject (caller adds to scene).
 */
export async function instantiateModel(
  asset: ModelAsset,
  options: InstantiateOptions,
): Promise<GameObject> {
  const { device } = options.renderSystem;

  // 1. Decode and upload textures
  const gpuTextures = await uploadTextures(asset, device);

  // 2. Create materials (with texture references)
  const materials = asset.materials.map(mat => {
    const albedoTex = mat.albedoTextureIndex !== null
      ? gpuTextures[mat.albedoTextureIndex] ?? undefined
      : undefined;
    return createMaterial({
      ...mat.params,
      albedoTexture: albedoTex,
    });
  });

  // 3. Create GPU meshes + material index lookup
  const meshes: Mesh[] = [];
  const meshMatIndices: number[] = [];
  for (const m of asset.meshes) {
    const stride = m.skinned ? SKINNED_VERTEX_STRIDE_FLOATS : 8;
    const gpuMesh = createMesh(device, m.geometry.vertices, m.geometry.indices, stride);
    gpuMesh.bounds = m.geometry.bounds;
    meshes.push(gpuMesh);
    meshMatIndices.push(m.materialIndex);
  }

  // 4. Build GameObject tree from nodes
  const ctx: BuildContext = {
    meshes, materials, meshMatIndices,
    renderSystem: options.renderSystem,
    asset,
  };

  if (asset.rootNodes.length === 1) {
    const root = buildNode(asset.rootNodes[0]!, ctx);
    setupSkinning(root, asset, ctx);
    return root;
  }

  // Multiple root nodes → wrap in a parent
  const root = new GameObject(asset.name);
  for (const node of asset.rootNodes) {
    const child = buildNode(node, ctx);
    child.setParent(root);
  }
  setupSkinning(root, asset, ctx);
  return root;
}

interface BuildContext {
  meshes: Mesh[];
  materials: Material[];
  meshMatIndices: number[];
  renderSystem: InstantiateContext;
  asset: ModelAsset;
}

async function uploadTextures(
  asset: ModelAsset,
  device: GPUDevice,
): Promise<GPUTextureHandle[]> {
  const results: GPUTextureHandle[] = [];

  for (const tex of asset.textures) {
    const blob = new Blob([tex.data as BlobPart], { type: tex.mimeType });
    const decoded = await decodeImageToRGBA(blob);
    results.push(createTextureFromRGBA(device, decoded.data, decoded.width, decoded.height));
  }

  return results;
}

function buildNode(node: ModelNode, ctx: BuildContext): GameObject {
  const go = new GameObject(node.name);

  // Apply TRS
  const t = go.transform;
  t.setPosition(node.position[0], node.position[1], node.position[2]);
  t.setRotation(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]);
  t.setScale(node.scale[0], node.scale[1], node.scale[2]);

  // Attach meshes
  if (node.meshIndices.length === 1) {
    attachMesh(go, node.meshIndices[0]!, node, ctx);
  } else if (node.meshIndices.length > 1) {
    for (const mi of node.meshIndices) {
      const child = new GameObject(`${node.name}_mesh${mi}`);
      child.setParent(go);
      attachMesh(child, mi, node, ctx);
    }
  }

  // Recurse children
  for (const childNode of node.children) {
    const childGo = buildNode(childNode, ctx);
    childGo.setParent(go);
  }

  return go;
}

function attachMesh(go: GameObject, mi: number, node: ModelNode, ctx: BuildContext): void {
  const mesh = ctx.meshes[mi];
  if (!mesh) return;

  const modelMesh = ctx.asset.meshes[mi];
  const matIdx = ctx.meshMatIndices[mi] ?? 0;

  if (modelMesh?.skinned && node.skinIndex !== undefined) {
    const skin = ctx.asset.skins[node.skinIndex];
    const jointCount = skin ? skin.jointNodeIndices.length : 0;
    const smr = go.addComponent(SkinnedMeshRenderer);
    smr.init(ctx.renderSystem, mesh, jointCount, ctx.materials[matIdx]);
  } else {
    const mr = go.addComponent(MeshRenderer);
    mr.init(ctx.renderSystem, mesh, ctx.materials[matIdx]);
  }
}

/**
 * After the full node tree is built, set up AnimationMixer on nodes that have skins.
 * This must be done after building the tree so we can resolve joint node references.
 */
function setupSkinning(root: GameObject, asset: ModelAsset, ctx: BuildContext): void {
  if (asset.skins.length === 0) return;

  const allObjects = collectAllObjects(root);

  for (const go of allObjects) {
    const smr = go.getComponent(SkinnedMeshRenderer);
    if (!smr) continue;

    const skinIndex = findSkinIndexForObject(go, asset);
    if (skinIndex === undefined) continue;

    const skin = asset.skins[skinIndex];
    if (!skin) continue;

    // Create skeleton using pre-computed parent indices and names
    const joints: Joint[] = skin.jointParents.map((parentIdx, i) => ({
      name: skin.jointNames[i] ?? `joint_${i}`,
      parentIndex: parentIdx,
    }));

    const skeleton = createSkeleton(joints, skin.inverseBindMatrices, skin.restT, skin.restR, skin.restS);

    const mixer = go.addComponent(AnimationMixer);
    mixer.skeleton = skeleton;

    // Convert model animations to clips (remap node indices → joint indices)
    const nodeToJoint = new Map<number, number>();
    for (let ji = 0; ji < skin.jointNodeIndices.length; ji++) {
      nodeToJoint.set(skin.jointNodeIndices[ji]!, ji);
    }

    for (const anim of asset.animations) {
      const tracks: KeyframeTrack[] = [];
      for (const track of anim.tracks) {
        const jointIndex = nodeToJoint.get(track.targetNode);
        if (jointIndex === undefined) continue;
        tracks.push({
          jointIndex,
          channel: track.path as AnimationChannel,
          interpolation: track.interpolation,
          times: track.times,
          values: track.values,
        });
      }
      if (tracks.length > 0) {
        const clip = createAnimationClip(anim.name, tracks);
        mixer.addClip(clip);
        if (!mixer.initialClip) {
          mixer.initialClip = clip.name;
        }
        if (mixer.layers.length === 0) {
          mixer.play(clip);
        }
      }
    }
  }

  // Add AnimationHandler on root to aggregate all child mixers
  if (!root.getComponent(AnimationHandler)) {
    const handler = root.addComponent(AnimationHandler);
    // Pick first clip name found across all mixers
    const allMixers = collectAllObjects(root)
      .map(go => go.getComponent(AnimationMixer))
      .filter((m): m is AnimationMixer => m !== null);
    for (const mixer of allMixers) {
      if (mixer.initialClip) {
        handler.initialClip = mixer.initialClip;
        break;
      }
    }
  }
}

function collectAllObjects(root: GameObject): GameObject[] {
  const result: GameObject[] = [root];
  for (const child of root.children) {
    result.push(...collectAllObjects(child));
  }
  return result;
}

function findSkinIndexForObject(go: GameObject, asset: ModelAsset): number | undefined {
  return findSkinInNodes(go.name, asset.rootNodes);
}

function findSkinInNodes(name: string, nodes: ModelNode[]): number | undefined {
  for (const node of nodes) {
    if (node.name === name && node.skinIndex !== undefined) return node.skinIndex;
    const found = findSkinInNodes(name, node.children);
    if (found !== undefined) return found;
  }
  return undefined;
}
