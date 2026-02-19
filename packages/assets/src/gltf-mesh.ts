/**
 * Extract meshes from a glTF document.
 * Interleaves vertex data into the engine's 32-byte format:
 *   position(3) + normal(3) + uv(2) = 8 floats per vertex.
 */

import { VERTEX_STRIDE_FLOATS } from '@atmos/renderer';
import { computeBoundingSphere } from '@atmos/renderer';
import type { GltfDocument, GltfPrimitive } from './gltf-parser.js';
import { readAccessor } from './gltf-parser.js';
import type { ModelMesh } from './types.js';

/**
 * Extract all meshes from the document.
 * Each glTF mesh may have multiple primitives; we flatten them into separate ModelMeshes.
 */
export function extractMeshes(doc: GltfDocument): ModelMesh[] {
  const meshes: ModelMesh[] = [];
  const gltfMeshes = doc.json.meshes ?? [];

  for (let mi = 0; mi < gltfMeshes.length; mi++) {
    const gltfMesh = gltfMeshes[mi]!;
    for (let pi = 0; pi < gltfMesh.primitives.length; pi++) {
      const prim = gltfMesh.primitives[pi]!;
      const name = gltfMesh.primitives.length === 1
        ? (gltfMesh.name ?? `mesh_${mi}`)
        : `${gltfMesh.name ?? `mesh_${mi}`}_prim${pi}`;
      meshes.push(extractPrimitive(doc, prim, name));
    }
  }
  return meshes;
}

function extractPrimitive(
  doc: GltfDocument,
  prim: GltfPrimitive,
  name: string,
): ModelMesh {
  // Read position (required)
  const posAccessor = prim.attributes['POSITION'];
  if (posAccessor === undefined) throw new Error(`Mesh "${name}" missing POSITION attribute`);
  const positions = readAccessor(doc, posAccessor) as Float32Array;
  const vertexCount = positions.length / 3;

  // Read normals (optional – generate flat normals if missing)
  let normals: Float32Array;
  const normalAccessor = prim.attributes['NORMAL'];
  if (normalAccessor !== undefined) {
    normals = readAccessor(doc, normalAccessor) as Float32Array;
  } else {
    normals = generateFlatNormals(positions, vertexCount);
  }

  // Read UVs (optional – zero if missing)
  let uvs: Float32Array;
  const uvAccessor = prim.attributes['TEXCOORD_0'];
  if (uvAccessor !== undefined) {
    uvs = readAccessor(doc, uvAccessor) as Float32Array;
  } else {
    uvs = new Float32Array(vertexCount * 2);
  }

  // Interleave into engine format
  const vertices = new Float32Array(vertexCount * VERTEX_STRIDE_FLOATS);
  for (let i = 0; i < vertexCount; i++) {
    const vo = i * VERTEX_STRIDE_FLOATS;
    const p = i * 3;
    const u = i * 2;
    vertices[vo] = positions[p]!;
    vertices[vo + 1] = positions[p + 1]!;
    vertices[vo + 2] = positions[p + 2]!;
    vertices[vo + 3] = normals[p]!;
    vertices[vo + 4] = normals[p + 1]!;
    vertices[vo + 5] = normals[p + 2]!;
    vertices[vo + 6] = uvs[u]!;
    vertices[vo + 7] = uvs[u + 1]!;
  }

  // Read indices
  let indices: Uint16Array | Uint32Array;
  if (prim.indices !== undefined) {
    const raw = readAccessor(doc, prim.indices);
    if (raw instanceof Uint32Array) {
      indices = raw;
    } else if (raw instanceof Uint16Array) {
      indices = raw;
    } else {
      // Convert other types (e.g. Uint8Array) to Uint16Array
      indices = new Uint16Array(raw.length);
      for (let i = 0; i < raw.length; i++) indices[i] = raw[i]!;
    }
    // Upgrade to Uint32 if any index exceeds 65535
    if (indices instanceof Uint16Array && vertexCount > 65535) {
      const u32 = new Uint32Array(indices.length);
      for (let i = 0; i < indices.length; i++) u32[i] = indices[i]!;
      indices = u32;
    }
  } else {
    // Non-indexed: generate sequential indices
    indices = vertexCount > 65535
      ? new Uint32Array(vertexCount)
      : new Uint16Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) indices[i] = i;
  }

  const bounds = computeBoundingSphere(vertices, VERTEX_STRIDE_FLOATS);

  return {
    name,
    geometry: { vertices, indices, bounds },
    materialIndex: prim.material ?? 0,
  };
}

/** Generate flat normals from triangle positions. */
function generateFlatNormals(positions: Float32Array, vertexCount: number): Float32Array {
  const normals = new Float32Array(vertexCount * 3);
  const triCount = Math.floor(vertexCount / 3);

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 9;
    const ax = positions[i0 + 3]! - positions[i0]!;
    const ay = positions[i0 + 4]! - positions[i0 + 1]!;
    const az = positions[i0 + 5]! - positions[i0 + 2]!;
    const bx = positions[i0 + 6]! - positions[i0]!;
    const by = positions[i0 + 7]! - positions[i0 + 1]!;
    const bz = positions[i0 + 8]! - positions[i0 + 2]!;

    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    const n0 = t * 9;
    for (let v = 0; v < 3; v++) {
      normals[n0 + v * 3] = nx;
      normals[n0 + v * 3 + 1] = ny;
      normals[n0 + v * 3 + 2] = nz;
    }
  }
  return normals;
}
