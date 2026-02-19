/**
 * Instantiate a ModelAsset into the engine's GameObject hierarchy.
 * Uploads textures to the GPU and creates Meshes + Materials + MeshRenderers.
 */

import { GameObject } from '@atmos/core';
import {
  createMesh,
  createMaterial,
  createTextureFromRGBA,
  decodeImageToRGBA,
  MeshRenderer,
} from '@atmos/renderer';
import type { PipelineResources, Mesh, Material, GPUTextureHandle } from '@atmos/renderer';
import type { ModelAsset, ModelNode } from './types.js';

export interface InstantiateOptions {
  device: GPUDevice;
  pipelineResources: PipelineResources;
}

/**
 * Create a GameObject tree from a ModelAsset.
 * Decodes and uploads textures, creates GPU meshes and materials.
 * Returns the root GameObject (caller adds to scene).
 */
export async function instantiateModel(
  asset: ModelAsset,
  options: InstantiateOptions,
): Promise<GameObject> {
  const { device, pipelineResources } = options;

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
    const gpuMesh = createMesh(device, m.geometry.vertices, m.geometry.indices, 8);
    gpuMesh.bounds = m.geometry.bounds;
    meshes.push(gpuMesh);
    meshMatIndices.push(m.materialIndex);
  }

  // 4. Build GameObject tree from nodes
  const ctx: BuildContext = { meshes, materials, meshMatIndices, device, pipelineResources };

  if (asset.rootNodes.length === 1) {
    return buildNode(asset.rootNodes[0]!, ctx);
  }

  // Multiple root nodes → wrap in a parent
  const root = new GameObject(asset.name);
  for (const node of asset.rootNodes) {
    const child = buildNode(node, ctx);
    child.setParent(root);
  }
  return root;
}

interface BuildContext {
  meshes: Mesh[];
  materials: Material[];
  meshMatIndices: number[];
  device: GPUDevice;
  pipelineResources: PipelineResources;
}

async function uploadTextures(
  asset: ModelAsset,
  device: GPUDevice,
): Promise<GPUTextureHandle[]> {
  const results: GPUTextureHandle[] = [];

  for (const tex of asset.textures) {
    const blob = new Blob([tex.data], { type: tex.mimeType });
    const decoded = await decodeImageToRGBA(blob);
    results.push(createTextureFromRGBA(device, decoded.data, decoded.width, decoded.height));
  }

  return results;
}

function buildNode(node: ModelNode, ctx: BuildContext): GameObject {
  const go = new GameObject(node.name);

  // Apply TRS
  const t = go.transform;
  t.position[0] = node.position[0];
  t.position[1] = node.position[1];
  t.position[2] = node.position[2];
  t.rotation[0] = node.rotation[0];
  t.rotation[1] = node.rotation[1];
  t.rotation[2] = node.rotation[2];
  t.rotation[3] = node.rotation[3];
  t.scale[0] = node.scale[0];
  t.scale[1] = node.scale[1];
  t.scale[2] = node.scale[2];
  t.markDirty();

  // Attach meshes
  if (node.meshIndices.length === 1) {
    const mi = node.meshIndices[0]!;
    const mesh = ctx.meshes[mi];
    if (mesh) {
      const mr = go.addComponent(MeshRenderer);
      const matIdx = ctx.meshMatIndices[mi] ?? 0;
      mr.init(ctx.device, ctx.pipelineResources, mesh, ctx.materials[matIdx]);
    }
  } else if (node.meshIndices.length > 1) {
    for (const mi of node.meshIndices) {
      const mesh = ctx.meshes[mi];
      if (!mesh) continue;
      const child = new GameObject(`${node.name}_mesh${mi}`);
      child.setParent(go);
      const mr = child.addComponent(MeshRenderer);
      const matIdx = ctx.meshMatIndices[mi] ?? 0;
      mr.init(ctx.device, ctx.pipelineResources, mesh, ctx.materials[matIdx]);
    }
  }

  // Recurse children
  for (const childNode of node.children) {
    const childGo = buildNode(childNode, ctx);
    childGo.setParent(go);
  }

  return go;
}
