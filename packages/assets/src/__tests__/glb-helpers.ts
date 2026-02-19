/**
 * Helpers to construct minimal GLB buffers for testing.
 */

import type { GltfJson } from '../gltf-parser.js';

const GLB_MAGIC = 0x46546C67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4E4F534A;
const CHUNK_BIN = 0x004E4942;

/** Build a GLB ArrayBuffer from JSON and optional binary data. */
export function buildGlb(json: GltfJson, bin?: ArrayBuffer): ArrayBuffer {
  const encoder = new TextEncoder();
  let jsonStr = JSON.stringify(json);
  // Pad JSON to 4-byte alignment with spaces
  while (jsonStr.length % 4 !== 0) jsonStr += ' ';
  const jsonBytes = encoder.encode(jsonStr);

  const binLength = bin ? alignTo4(bin.byteLength) : 0;
  const totalLength = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + binLength : 0);

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  let offset = 0;

  // Header
  view.setUint32(offset, GLB_MAGIC, true); offset += 4;
  view.setUint32(offset, GLB_VERSION, true); offset += 4;
  view.setUint32(offset, totalLength, true); offset += 4;

  // JSON chunk
  view.setUint32(offset, jsonBytes.byteLength, true); offset += 4;
  view.setUint32(offset, CHUNK_JSON, true); offset += 4;
  u8.set(jsonBytes, offset); offset += jsonBytes.byteLength;

  // BIN chunk
  if (bin) {
    view.setUint32(offset, binLength, true); offset += 4;
    view.setUint32(offset, CHUNK_BIN, true); offset += 4;
    u8.set(new Uint8Array(bin), offset);
  }

  return buffer;
}

function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

/**
 * Create a minimal triangle GLB (3 vertices, 3 indices).
 * Positions: (0,0,0), (1,0,0), (0,1,0)
 * Normals: (0,0,1) for all
 * UVs: (0,0), (1,0), (0,1)
 * Indices: 0,1,2
 */
export function createTriangleGlb(): ArrayBuffer {
  // Binary buffer layout:
  // positions: 3 * 3 * 4 = 36 bytes (bufferView 0)
  // normals: 3 * 3 * 4 = 36 bytes (bufferView 1)
  // uvs: 3 * 2 * 4 = 24 bytes (bufferView 2)
  // indices: 3 * 2 = 6 bytes + 2 pad = 8 bytes (bufferView 3)
  const binSize = 36 + 36 + 24 + 8;
  const bin = new ArrayBuffer(binSize);
  const f32 = new Float32Array(bin);
  const u16 = new Uint16Array(bin);

  // Positions at offset 0
  f32[0] = 0; f32[1] = 0; f32[2] = 0;
  f32[3] = 1; f32[4] = 0; f32[5] = 0;
  f32[6] = 0; f32[7] = 1; f32[8] = 0;

  // Normals at byte 36 (float index 9)
  f32[9] = 0;  f32[10] = 0; f32[11] = 1;
  f32[12] = 0; f32[13] = 0; f32[14] = 1;
  f32[15] = 0; f32[16] = 0; f32[17] = 1;

  // UVs at byte 72 (float index 18)
  f32[18] = 0; f32[19] = 0;
  f32[20] = 1; f32[21] = 0;
  f32[22] = 0; f32[23] = 1;

  // Indices at byte 96 (u16 index 48)
  u16[48] = 0; u16[49] = 1; u16[50] = 2;

  const json: GltfJson = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binSize }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },   // positions
      { buffer: 0, byteOffset: 36, byteLength: 36 },   // normals
      { buffer: 0, byteOffset: 72, byteLength: 24 },   // uvs
      { buffer: 0, byteOffset: 96, byteLength: 6 },    // indices
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },  // positions
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },  // normals
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },  // uvs
      { bufferView: 3, componentType: 5123, count: 3, type: 'SCALAR' }, // indices
    ],
    meshes: [{
      name: 'Triangle',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      name: 'Red',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0, 0, 1],
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    }],
    nodes: [{ name: 'TriangleNode', mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };

  return buildGlb(json, bin);
}
