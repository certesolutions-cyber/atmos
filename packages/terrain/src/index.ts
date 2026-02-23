// Types
export type { DensityFn, DensityWithWeightsFn, DensitySample, SplatWeightFn, SplatTextures } from './types.js';
export type { ChunkCoord, TerrainConfig, MeshData, TerrainEdit, LODConfig } from './types.js';
export { BrushShape, ChunkState, DEFAULT_TERRAIN_CONFIG, DEFAULT_LOD_CONFIG } from './types.js';

// Chunk key utilities
export { chunkKey, fromChunkKey, worldToChunk } from './chunk-key.js';

// Marching cubes
export { extractSurface, computeTriplanarUVs } from './marching-cubes.js';

// Normals
export { computeGradientNormals, computeTriangleNormals } from './terrain-normals.js';

// Density primitives & CSG
export {
  adaptDensityFn,
  sphereDensity,
  planeDensity,
  boxDensity,
  unionDensity,
  intersectDensity,
  subtractDensity,
  noiseTerrain,
} from './density-field.js';

// Chunk
export { TerrainChunk } from './chunk.js';

// Editor (brush system)
export { applyEdit } from './terrain-editor.js';

// LOD
export { extractSurfaceLOD } from './lod-extract.js';
export { buildLODMesh, buildLODSplatMesh } from './lod-chunk.js';

// Components
export { TerrainVolume } from './terrain-volume.js';
export { TerrainWorld } from './terrain-world.js';

// Registration
export { registerTerrainBuiltins } from './register-builtins.js';
