import type { GPUTextureHandle } from "@certe/atmos-renderer";

/** Density function: positive = air, negative = solid, surface at isoLevel */
export type DensityFn = (x: number, y: number, z: number) => number;

/** 2D height function: world (x, z) → height (y) */
export type HeightFn = (x: number, z: number) => number;

/** Heightmap data: flat row-major Float32Array + dimensions */
export interface HeightmapData {
  heights: Float32Array;   // row-major, heights[z * width + x]
  width: number;           // samples in X direction
  depth: number;           // samples in Z direction
  scaleX: number;          // world-space distance between samples in X
  scaleZ: number;          // world-space distance between samples in Z
  scaleY: number;          // height scaling (height * scaleY = world Y)
  offsetX?: number;        // heightmap origin in world-space (default 0)
  offsetZ?: number;        // (default 0)
}

export interface DensitySample {
  density: number;
  weights?: Float32Array;
}

export type DensityWithWeightsFn = (x: number, y: number, z: number) => DensitySample;

/** Computes splat weights from surface normal + world height. Returns [w0, w1]; w2 = 1 - w0 - w1. */
export type SplatWeightFn = (nx: number, ny: number, nz: number, worldY: number) => [number, number];

/** Three splat textures (grass/rock/snow or similar) used by the terrain pipeline. */
export type SplatTextures = [GPUTextureHandle, GPUTextureHandle, GPUTextureHandle];

export interface ChunkCoord {
  cx: number;
  cy: number;
  cz: number;
}

export interface TerrainConfig {
  /** Voxels per chunk axis (default 16) */
  chunkSize: number;
  /** World-space size of each voxel (default 1) */
  voxelSize: number;
  /** Density threshold for surface extraction (default 0) */
  isoLevel: number;
  /** Use gradient-based smooth normals instead of triangle normals */
  smoothNormals: boolean;
  /** Epsilon for central-difference gradient normals */
  normalEpsilon: number;
}

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  chunkSize: 16,
  voxelSize: 1,
  isoLevel: 0,
  smoothNormals: true,
  normalEpsilon: 0.5,
};

export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

export const enum BrushShape {
  Sphere = 0,
  Cube = 1,
}

export interface TerrainEdit {
  shape: BrushShape;
  /** World-space center of the brush */
  x: number;
  y: number;
  z: number;
  /** Brush radius (half-extent for cube) */
  radius: number;
  /** Positive adds material (dig), negative removes (fill). Magnitude = strength. */
  strength: number;
  /** Smooth falloff within the brush (0 = hard edge, 1 = full falloff) */
  falloff: number;
}

export const enum ChunkState {
  Empty = 0,
  Sampled = 1,
  Meshed = 2,
  Dirty = 3,
}

export interface LODConfig {
  /** Distance thresholds in chunks: [lod0→lod1, lod1→lod2] */
  lodDistances: [number, number];
}

export const DEFAULT_LOD_CONFIG: LODConfig = {
  lodDistances: [3, 6],
};