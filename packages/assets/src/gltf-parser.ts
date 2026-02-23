/**
 * Minimal glTF 2.0 / GLB parser.
 * Handles the binary container format and accessor/bufferView resolution.
 * No external dependencies.
 */

/* ------------------------------------------------------------------ */
/*  glTF JSON types (subset we use)                                   */
/* ------------------------------------------------------------------ */

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

export interface GltfBuffer {
  byteLength: number;
  uri?: string;
}

export interface GltfImage {
  bufferView?: number;
  mimeType?: string;
  uri?: string;
}

export interface GltfTexture {
  source?: number;
}

export interface GltfMaterialPbr {
  baseColorFactor?: number[];
  baseColorTexture?: { index: number };
  metallicFactor?: number;
  roughnessFactor?: number;
}

export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: GltfMaterialPbr;
  alphaMode?: string;
  alphaCutoff?: number;
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
}

export interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

export interface GltfNode {
  name?: string;
  mesh?: number;
  skin?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

export interface GltfSkin {
  name?: string;
  inverseBindMatrices?: number;
  skeleton?: number;
  joints: number[];
}

export interface GltfAnimationSampler {
  input: number;
  output: number;
  interpolation?: string;
}

export interface GltfAnimationChannel {
  sampler: number;
  target: { node?: number; path: string };
}

export interface GltfAnimation {
  name?: string;
  channels: GltfAnimationChannel[];
  samplers: GltfAnimationSampler[];
}

export interface GltfScene {
  nodes?: number[];
}

export interface GltfJson {
  asset: { version: string };
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  images?: GltfImage[];
  textures?: GltfTexture[];
  materials?: GltfMaterial[];
  meshes?: GltfMesh[];
  nodes?: GltfNode[];
  scenes?: GltfScene[];
  scene?: number;
  skins?: GltfSkin[];
  animations?: GltfAnimation[];
}

/** Parsed glTF document with resolved binary buffers. */
export interface GltfDocument {
  json: GltfJson;
  buffers: ArrayBuffer[];
}

/* ------------------------------------------------------------------ */
/*  GLB magic / constants                                             */
/* ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546C67; // 'glTF'
const GLB_CHUNK_JSON = 0x4E4F534A;
const GLB_CHUNK_BIN = 0x004E4942;

/* ------------------------------------------------------------------ */
/*  Component type → TypedArray mapping                               */
/* ------------------------------------------------------------------ */

const COMPONENT_TYPES: Record<number, { BYTES: number; Array: typeof Float32Array | typeof Uint16Array | typeof Uint32Array | typeof Int16Array | typeof Uint8Array | typeof Int8Array }> = {
  5120: { BYTES: 1, Array: Int8Array },
  5121: { BYTES: 1, Array: Uint8Array },
  5122: { BYTES: 2, Array: Int16Array },
  5123: { BYTES: 2, Array: Uint16Array },
  5125: { BYTES: 4, Array: Uint32Array },
  5126: { BYTES: 4, Array: Float32Array },
};

const TYPE_COUNTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Parse a GLB binary container into JSON + binary buffer(s). */
export function parseGlb(data: ArrayBuffer): GltfDocument {
  const view = new DataView(data);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) throw new Error('Not a valid GLB file');

  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported glTF version: ${version}`);

  let offset = 12; // skip header (magic + version + length)
  let json: GltfJson | null = null;
  const buffers: ArrayBuffer[] = [];

  while (offset < data.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkData = data.slice(offset + 8, offset + 8 + chunkLength);

    if (chunkType === GLB_CHUNK_JSON) {
      const decoder = new TextDecoder();
      json = JSON.parse(decoder.decode(chunkData)) as GltfJson;
    } else if (chunkType === GLB_CHUNK_BIN) {
      buffers.push(chunkData);
    }
    offset += 8 + chunkLength;
  }

  if (!json) throw new Error('GLB file missing JSON chunk');
  return { json, buffers };
}

/** Parse a standalone .gltf JSON file with external buffer(s). */
export function parseGltfJson(json: GltfJson, buffers?: ArrayBuffer[]): GltfDocument {
  return { json, buffers: buffers ?? [] };
}

/** DataView readers indexed by componentType. */
const DV_READ: Record<number, (dv: DataView, off: number) => number> = {
  5120: (dv, o) => dv.getInt8(o),
  5121: (dv, o) => dv.getUint8(o),
  5122: (dv, o) => dv.getInt16(o, true),
  5123: (dv, o) => dv.getUint16(o, true),
  5125: (dv, o) => dv.getUint32(o, true),
  5126: (dv, o) => dv.getFloat32(o, true),
};

/** Normalization divisors for integer component types (signed / unsigned). */
const NORM_DIVISOR: Record<number, number> = {
  5120: 127,    // INT8   → [-1,1]
  5121: 255,    // UINT8  → [0,1]
  5122: 32767,  // INT16  → [-1,1]
  5123: 65535,  // UINT16 → [0,1]
  5125: 4294967295, // UINT32
};

/** Read a typed array from an accessor. */
export function readAccessor(doc: GltfDocument, accessorIndex: number): Float32Array | Uint16Array | Uint32Array | Int16Array | Uint8Array | Int8Array {
  const accessor = doc.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Accessor ${accessorIndex} not found`);

  const ct = COMPONENT_TYPES[accessor.componentType];
  if (!ct) throw new Error(`Unknown component type: ${accessor.componentType}`);

  const typeCount = TYPE_COUNTS[accessor.type];
  if (typeCount === undefined) throw new Error(`Unknown accessor type: ${accessor.type}`);

  const elementCount = accessor.count * typeCount;
  const normalized = accessor.normalized === true;

  if (accessor.bufferView === undefined) {
    return normalized ? new Float32Array(elementCount) : new ct.Array(elementCount);
  }

  const bufferView = doc.json.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`BufferView ${accessor.bufferView} not found`);

  const buffer = doc.buffers[bufferView.buffer];
  if (!buffer) throw new Error(`Buffer ${bufferView.buffer} not found`);

  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const elementBytes = ct.BYTES * typeCount;
  const stride = bufferView.byteStride ?? elementBytes;

  // Fast path: tightly packed floats, no normalization — direct view
  if (!normalized && stride === elementBytes && accessor.componentType === 5126) {
    return new Float32Array(buffer, byteOffset, elementCount);
  }

  // Fast path: tightly packed non-float, no normalization, aligned
  if (!normalized && stride === elementBytes && byteOffset % ct.BYTES === 0) {
    return new ct.Array(buffer, byteOffset, elementCount);
  }

  // General path: DataView handles any alignment and stride
  const dv = new DataView(buffer);
  const read = DV_READ[accessor.componentType];
  if (!read) throw new Error(`No reader for componentType ${accessor.componentType}`);

  if (normalized) {
    // Normalized integer → float output
    const divisor = NORM_DIVISOR[accessor.componentType] ?? 1;
    const result = new Float32Array(elementCount);
    for (let i = 0; i < accessor.count; i++) {
      const elemStart = byteOffset + i * stride;
      for (let j = 0; j < typeCount; j++) {
        result[i * typeCount + j] = read(dv, elemStart + j * ct.BYTES) / divisor;
      }
    }
    return result;
  }

  // Non-normalized strided copy
  const result = new ct.Array(elementCount);
  for (let i = 0; i < accessor.count; i++) {
    const elemStart = byteOffset + i * stride;
    for (let j = 0; j < typeCount; j++) {
      result[i * typeCount + j] = read(dv, elemStart + j * ct.BYTES);
    }
  }
  return result;
}

/** Read raw bytes from a bufferView (for embedded images). */
export function readBufferView(doc: GltfDocument, bufferViewIndex: number): Uint8Array {
  const bv = doc.json.bufferViews?.[bufferViewIndex];
  if (!bv) throw new Error(`BufferView ${bufferViewIndex} not found`);

  const buffer = doc.buffers[bv.buffer];
  if (!buffer) throw new Error(`Buffer ${bv.buffer} not found`);

  return new Uint8Array(buffer, bv.byteOffset ?? 0, bv.byteLength);
}
