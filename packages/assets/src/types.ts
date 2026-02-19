import type { GeometryData } from '@atmos/renderer';
import type { MaterialParams } from '@atmos/renderer';

/** A single mesh extracted from a model file. */
export interface ModelMesh {
  name: string;
  geometry: GeometryData;
  materialIndex: number;
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
}
