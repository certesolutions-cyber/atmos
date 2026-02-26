/**
 * Extract meshes from a glTF document.
 * Interleaves vertex data into the engine's format:
 *   Static:  position(3) + normal(3) + uv(2) = 8 floats = 32 bytes
 *   Skinned: position(3) + normal(3) + uv(2) + joints_u8x4(1) + weights(4) = 13 floats = 52 bytes
 */

import { VERTEX_STRIDE_FLOATS, SKINNED_VERTEX_STRIDE_FLOATS } from '@certe/atmos-renderer';
import { computeBoundingSphere } from '@certe/atmos-renderer';
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

  // Detect skinning attributes
  const jointsAccessor = prim.attributes['JOINTS_0'];
  const weightsAccessor = prim.attributes['WEIGHTS_0'];
  const skinned = jointsAccessor !== undefined && weightsAccessor !== undefined;

  let vertices: Float32Array;
  let stride: number;

  if (skinned) {
    stride = SKINNED_VERTEX_STRIDE_FLOATS; // 13
    vertices = interleaveSkinnedVertices(
      doc, positions, normals, uvs, vertexCount,
      jointsAccessor!, weightsAccessor!,
    );
  } else {
    stride = VERTEX_STRIDE_FLOATS; // 8
    vertices = new Float32Array(vertexCount * stride);
    for (let i = 0; i < vertexCount; i++) {
      const vo = i * stride;
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
      indices = new Uint16Array(raw.length);
      for (let i = 0; i < raw.length; i++) indices[i] = raw[i]!;
    }
    if (indices instanceof Uint16Array && vertexCount > 65535) {
      const u32 = new Uint32Array(indices.length);
      for (let i = 0; i < indices.length; i++) u32[i] = indices[i]!;
      indices = u32;
    }
  } else {
    indices = vertexCount > 65535
      ? new Uint32Array(vertexCount)
      : new Uint16Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) indices[i] = i;
  }

  const bounds = computeBoundingSphere(vertices, stride);

  return {
    name,
    geometry: { vertices, indices, bounds },
    materialIndex: prim.material ?? 0,
    skinned,
  };
}

/**
 * Interleave skinned vertex data into 56-byte format.
 * Layout: pos(3f) + normal(3f) + uv(2f) + joints_u16x4(2f) + weights(4f)
 */
function interleaveSkinnedVertices(
  doc: GltfDocument,
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  vertexCount: number,
  jointsAccessorIdx: number,
  weightsAccessorIdx: number,
): Float32Array {
  const stride = SKINNED_VERTEX_STRIDE_FLOATS; // 14
  const jointsRaw = readAccessor(doc, jointsAccessorIdx);
  const weightsRaw = readAccessor(doc, weightsAccessorIdx) as Float32Array;

  const vertices = new Float32Array(vertexCount * stride);
  // Uint16 view overlaid on same buffer for packing joint indices
  const verticesU16 = new Uint16Array(vertices.buffer);

  for (let i = 0; i < vertexCount; i++) {
    const vo = i * stride;
    const p = i * 3;
    const u = i * 2;
    const j = i * 4;

    // Position
    vertices[vo] = positions[p]!;
    vertices[vo + 1] = positions[p + 1]!;
    vertices[vo + 2] = positions[p + 2]!;
    // Normal
    vertices[vo + 3] = normals[p]!;
    vertices[vo + 4] = normals[p + 1]!;
    vertices[vo + 5] = normals[p + 2]!;
    // UV
    vertices[vo + 6] = uvs[u]!;
    vertices[vo + 7] = uvs[u + 1]!;

    // Joint indices: 4 × u16 at byte offset 32 (= float offset 8 × 4 bytes)
    const u16Offset = (vo * 4 + 32) / 2; // byte offset → u16 index
    verticesU16[u16Offset] = jointsRaw[j]! & 0xFFFF;
    verticesU16[u16Offset + 1] = jointsRaw[j + 1]! & 0xFFFF;
    verticesU16[u16Offset + 2] = jointsRaw[j + 2]! & 0xFFFF;
    verticesU16[u16Offset + 3] = jointsRaw[j + 3]! & 0xFFFF;

    // Weights: 4 × f32 at float offset 10 (byte offset 40)
    vertices[vo + 10] = weightsRaw[j]!;
    vertices[vo + 11] = weightsRaw[j + 1]!;
    vertices[vo + 12] = weightsRaw[j + 2]!;
    vertices[vo + 13] = weightsRaw[j + 3]!;
  }

  return vertices;
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
