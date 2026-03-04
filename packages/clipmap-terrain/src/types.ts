/**
 * Clipmap terrain configuration and types.
 *
 * Geometry clipmap: concentric LOD rings around the camera. Each ring uses
 * the same grid topology but doubles cell size per level. The GPU vertex
 * shader samples a heightmap texture to displace Y.
 */

/** Height function: returns world-space Y for a given (x, z). */
export type HeightFn = (x: number, z: number) => number;

/** Configuration for a clipmap terrain. */
export interface ClipmapConfig {
  /** Grid vertices per side (must be 4k+1, e.g. 65, for stitch alignment). Default 65. */
  gridSize: number;
  /** World-space size of the finest (level 0) cell. Default 1. */
  cellSize: number;
  /** Number of LOD levels. Default 6. */
  levels: number;
  /** Heightmap texture width/height in pixels. Default 1024. */
  heightmapResolution: number;
  /** World-space extent that the heightmap covers on each axis. Default 2048. */
  heightmapWorldSize: number;
}

/** Default clipmap configuration. */
export const DEFAULT_CLIPMAP_CONFIG: Readonly<ClipmapConfig> = {
  gridSize: 65,
  cellSize: 1,
  levels: 6,
  heightmapResolution: 1024,
  heightmapWorldSize: 2048,
};

/** Per-level uniform data written to GPU each frame. */
export interface ClipmapLevelUniforms {
  /** World-space origin of this level's grid (snapped). */
  originX: number;
  originZ: number;
  /** World-space cell size for this level: cellSize * 2^level. */
  scale: number;
  /** Grid size (vertex count per side). */
  gridSize: number;
  /** Heightmap texel-to-world conversion: worldSize / resolution. */
  heightmapTexelSize: number;
  /** Heightmap world size. */
  heightmapWorldSize: number;
}

/**
 * CPU-side grid mesh data (Float32Array vertices + Uint32Array indices).
 * Vertex format: 2 floats per vertex (ix, iz) = 8 bytes stride.
 */
export interface ClipmapGridData {
  vertices: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

/** Clipmap vertex stride: 2 floats (ix, iz). */
export const CLIPMAP_VERTEX_STRIDE_FLOATS = 2;
export const CLIPMAP_VERTEX_STRIDE_BYTES = 8;

/**
 * Per-level uniform buffer size in bytes.
 * Layout (std140):
 *   vec4(originX, originZ, scale, gridSize)           = 16
 *   vec4(texelSize, hmWorldSize, 0, 0)                = 16
 * Total = 32 bytes.
 */
export const CLIPMAP_LEVEL_UNIFORM_SIZE = 32;

/** Object uniform size: MVP(64) + model(64) = 128 bytes. */
export const CLIPMAP_OBJECT_UNIFORM_SIZE = 128;
