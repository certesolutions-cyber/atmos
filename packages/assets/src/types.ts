import type { GeometryData } from '@atmos/renderer';
import type { MaterialParams } from '@atmos/renderer';

/** A single mesh extracted from a model file. */
export interface ModelMesh {
  name: string;
  geometry: GeometryData;
  materialIndex: number;
  /** True if vertex data includes joint indices + weights (52B skinned format). */
  skinned: boolean;
  /** Index into ModelAsset.skins (only set if skinned). */
  skinIndex?: number;
}

/** Raw texture data extracted from a model file (CPU-side, not yet uploaded). */
export interface ModelTexture {
  name: string;
  data: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
}

/** Material extracted from a model file. */
export interface ModelMaterial {
  name: string;
  params: MaterialParams;
  albedoTextureIndex: number | null;
}

/** A node in the model's scene hierarchy. */
export interface ModelNode {
  name: string;
  meshIndices: number[];
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion xyzw
  scale: [number, number, number];
  children: ModelNode[];
  /** Index into ModelAsset.skins (set when the node references a glTF skin). */
  skinIndex?: number;
}

/** Skin data extracted from a model file (joint hierarchy + inverse bind matrices). */
export interface ModelSkin {
  name: string;
  /** Indices into the node array, identifying which nodes are joints. */
  jointNodeIndices: number[];
  /** Flat Float32Array: jointCount * 16 floats (one mat4 per joint). */
  inverseBindMatrices: Float32Array;
  /** Parent joint index for each joint (-1 = root). Pre-computed from node hierarchy. */
  jointParents: number[];
  /** Node names for each joint, indexed same as jointNodeIndices. */
  jointNames: string[];
  /** Rest-pose local translations: jointCount * 3 floats. */
  restT: Float32Array;
  /** Rest-pose local rotations (quaternions): jointCount * 4 floats. */
  restR: Float32Array;
  /** Rest-pose local scales: jointCount * 3 floats. */
  restS: Float32Array;
}

/** A single animation track targeting one node's T/R/S channel. */
export interface ModelAnimationTrack {
  /** Index into the model's node array. */
  targetNode: number;
  /** Which channel: 'translation' | 'rotation' | 'scale' */
  path: 'translation' | 'rotation' | 'scale';
  /** Interpolation mode. */
  interpolation: 'LINEAR' | 'STEP';
  /** Keyframe timestamps (seconds). */
  times: Float32Array;
  /** Keyframe values (3 or 4 floats per keyframe). */
  values: Float32Array;
}

/** A named animation extracted from a model file. */
export interface ModelAnimation {
  name: string;
  tracks: ModelAnimationTrack[];
}

/**
 * Format-agnostic, GPU-free model representation.
 * Parse off the main thread, then instantiate on the GPU thread.
 */
export interface ModelAsset {
  name: string;
  meshes: ModelMesh[];
  materials: ModelMaterial[];
  textures: ModelTexture[];
  rootNodes: ModelNode[];
  skins: ModelSkin[];
  animations: ModelAnimation[];
}
