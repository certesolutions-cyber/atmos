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

/** Read a typed array from an accessor. */
export function readAccessor(doc: GltfDocument, accessorIndex: number): Float32Array | Uint16Array | Uint32Array | Int16Array | Uint8Array | Int8Array {
  const accessor = doc.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Accessor ${accessorIndex} not found`);

  const ct = COMPONENT_TYPES[accessor.componentType];
  if (!ct) throw new Error(`Unknown component type: ${accessor.componentType}`);

  const typeCount = TYPE_COUNTS[accessor.type];
  if (typeCount === undefined) throw new Error(`Unknown accessor type: ${accessor.type}`);

  const elementCount = accessor.count * typeCount;

  if (accessor.bufferView === undefined) {
    // No bufferView → return zeroed array
    return new ct.Array(elementCount);
  }

  const bufferView = doc.json.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`BufferView ${accessor.bufferView} not found`);

  const buffer = doc.buffers[bufferView.buffer];
  if (!buffer) throw new Error(`Buffer ${bufferView.buffer} not found`);

  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

  // If stride matches element size (or no stride), we can create a view directly
  const elementBytes = ct.BYTES * typeCount;
  const stride = bufferView.byteStride;

  if (!stride || stride === elementBytes) {
    return new ct.Array(buffer, byteOffset, elementCount);
  }

  // Strided access: copy element by element
  const result = new ct.Array(elementCount);
  const src = new ct.Array(buffer);
  for (let i = 0; i < accessor.count; i++) {
    const srcOffset = (byteOffset + i * stride) / ct.BYTES;
    for (let j = 0; j < typeCount; j++) {
      result[i * typeCount + j] = src[srcOffset + j]!;
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
