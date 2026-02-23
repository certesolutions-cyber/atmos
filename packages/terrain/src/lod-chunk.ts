import {
  createMesh, computeBoundingSphere,
  VERTEX_STRIDE_FLOATS, TERRAIN_VERTEX_STRIDE_FLOATS,
} from '@atmos/renderer';
import type { Mesh } from '@atmos/renderer';
import { extractSurfaceLOD } from './lod-extract.js';
import { computeTriplanarUVs } from './marching-cubes.js';
import { computeGradientNormals, computeTriangleNormals } from './terrain-normals.js';
import type { TerrainChunk } from './chunk.js';
import type { DensityFn, TerrainConfig, SplatWeightFn } from './types.js';

/** Max triangles per chunk at a given effective resolution. */
function maxTriangles(effectiveSize: number): number {
  return effectiveSize * effectiveSize * effectiveSize * 5;
}

// --- Build profiling ---
interface StepStats {
  totalMs: number;
  count: number;
}

interface LODProfile {
  density: StepStats;
  marchingCubes: StepStats;
  normals: StepStats;
  uvs: StepStats;
  gpuUpload: StepStats;
  total: StepStats;
}

const _profiles = new Map<number, LODProfile>();
let _logTimer = 0;
const LOG_INTERVAL_MS = 3000;

function getProfile(lod: number): LODProfile {
  let p = _profiles.get(lod);
  if (!p) {
    const s = (): StepStats => ({ totalMs: 0, count: 0 });
    p = { density: s(), marchingCubes: s(), normals: s(), uvs: s(), gpuUpload: s(), total: s() };
    _profiles.set(lod, p);
  }
  return p;
}

function addSample(stats: StepStats, ms: number): void {
  stats.totalMs += ms;
  stats.count++;
}

function avg(stats: StepStats): string {
  return stats.count > 0 ? (stats.totalMs / stats.count).toFixed(2) : '-.--';
}

function maybeLog(): void {
  const now = performance.now();
  if (now - _logTimer < LOG_INTERVAL_MS) return;
  _logTimer = now;

  for (const [lod, p] of _profiles) {
    if (p.total.count === 0) continue;
    console.log(
      `[Terrain LOD${lod}] n=${p.total.count} ` +
      `total=${avg(p.total)}ms ` +
      `density=${avg(p.density)}ms ` +
      `MC=${avg(p.marchingCubes)}ms ` +
      `normals=${avg(p.normals)}ms ` +
      `uvs=${avg(p.uvs)}ms ` +
      `gpu=${avg(p.gpuUpload)}ms`,
    );
  }
}

// --- Pooled scratch buffers (reused across all buildLODMesh calls) ---
let _poolVerts: Float32Array | null = null;
let _poolIdx: Uint32Array | null = null;
let _poolDensity: Float32Array | null = null;

function getScratchVerts(minFloats: number): Float32Array {
  if (!_poolVerts || _poolVerts.length < minFloats) {
    _poolVerts = new Float32Array(minFloats);
  }
  return _poolVerts;
}

function getScratchIdx(minLen: number): Uint32Array {
  if (!_poolIdx || _poolIdx.length < minLen) {
    _poolIdx = new Uint32Array(minLen);
  }
  return _poolIdx;
}

function getScratchDensity(minLen: number): Float32Array {
  if (!_poolDensity || _poolDensity.length < minLen) {
    _poolDensity = new Float32Array(minLen);
  }
  return _poolDensity;
}

let _poolSplatVerts: Float32Array | null = null;
function getScratchSplatVerts(minFloats: number): Float32Array {
  if (!_poolSplatVerts || _poolSplatVerts.length < minFloats) {
    _poolSplatVerts = new Float32Array(minFloats);
  }
  return _poolSplatVerts;
}

/**
 * Build a mesh at the given LOD level with grid overlap
 * to hide cracks at LOD transitions.
 *
 * When `skirtFaces` is non-zero and `densityFn` is provided, the MC grid
 * is extended by 1 cell (step voxels) past each boundary. The resulting
 * mesh naturally overlaps with neighbors and the depth buffer hides seams.
 * No extra skirt geometry — just real terrain surface past the boundary.
 */
export function buildLODMesh(
  chunk: TerrainChunk,
  device: GPUDevice,
  config: TerrainConfig,
  lodLevel: number,
  skirtFaces: number,
  densityFn?: DensityFn,
): Mesh | null {
  const tStart = performance.now();
  const prof = getProfile(lodLevel);

  const s = config.chunkSize;
  const step = 1 << lodLevel;
  const voxelSize = config.voxelSize;

  const useOverlap = skirtFaces !== 0 && densityFn != null;
  const ext = useOverlap ? step : 0;
  const gridSize = s + 2 * ext;
  const effectiveSize = gridSize / step;

  // Build density grid — extended or original
  const tDensity = performance.now();
  let densityGrid: Float32Array;
  if (useOverlap) {
    const gs1 = gridSize + 1;
    const gridLen = gs1 * gs1 * gs1;
    densityGrid = getScratchDensity(gridLen);
    const originX = (chunk.cx * s - ext) * voxelSize;
    const originY = (chunk.cy * s - ext) * voxelSize;
    const originZ = (chunk.cz * s - ext) * voxelSize;
    // Only sample at positions extractSurfaceLOD actually reads (step intervals)
    const stepVoxel = step * voxelSize;
    for (let z = 0; z <= gridSize; z += step) {
      for (let y = 0; y <= gridSize; y += step) {
        for (let x = 0; x <= gridSize; x += step) {
          densityGrid[z * gs1 * gs1 + y * gs1 + x] = densityFn(
            originX + x * voxelSize,
            originY + y * voxelSize,
            originZ + z * voxelSize,
          );
        }
      }
    }
  } else {
    densityGrid = chunk.densityGrid;
  }
  addSample(prof.density, performance.now() - tDensity);

  // Reuse pooled scratch buffers
  const maxVerts = maxTriangles(effectiveSize) * 3;
  const scratchVerts = getScratchVerts(maxVerts * VERTEX_STRIDE_FLOATS);
  const scratchIdx = getScratchIdx(maxVerts);

  // 1. Extract surface via marching cubes
  const tMC = performance.now();
  const meshData = extractSurfaceLOD(
    densityGrid, gridSize, step, voxelSize, config.isoLevel,
    scratchVerts, scratchIdx,
  );
  addSample(prof.marchingCubes, performance.now() - tMC);

  if (meshData.vertexCount === 0 || meshData.indexCount === 0) {
    return null;
  }

  // 2. Offset vertices back to chunk-local space
  if (useOverlap) {
    const offset = ext * voxelSize;
    for (let vi = 0; vi < meshData.vertexCount; vi++) {
      const o = vi * VERTEX_STRIDE_FLOATS;
      scratchVerts[o] -= offset;
      scratchVerts[o + 1] -= offset;
      scratchVerts[o + 2] -= offset;
    }
  }

  // 3. Compute normals
  const tNormals = performance.now();
  if (lodLevel <= 1 && config.smoothNormals && densityFn) {
    const originX = chunk.cx * s * voxelSize;
    const originY = chunk.cy * s * voxelSize;
    const originZ = chunk.cz * s * voxelSize;
    const worldDensity: DensityFn = (x, y, z) =>
      densityFn(x + originX, y + originY, z + originZ);
    computeGradientNormals(
      scratchVerts, meshData.vertexCount,
      worldDensity, config.normalEpsilon,
    );
  } else {
    computeTriangleNormals(
      scratchVerts, scratchIdx,
      meshData.vertexCount, meshData.indexCount,
    );
  }
  addSample(prof.normals, performance.now() - tNormals);

  // 4. Compute triplanar UVs
  const tUV = performance.now();
  computeTriplanarUVs(scratchVerts, meshData.vertexCount);
  addSample(prof.uvs, performance.now() - tUV);

  // Trim and create GPU mesh
  const tGPU = performance.now();
  const trimmedVerts = scratchVerts.subarray(0, meshData.vertexCount * VERTEX_STRIDE_FLOATS);
  const trimmedIdx = scratchIdx.subarray(0, meshData.indexCount);

  const gpuMesh = createMesh(device, trimmedVerts, trimmedIdx, VERTEX_STRIDE_FLOATS);
  gpuMesh.bounds = computeBoundingSphere(trimmedVerts, VERTEX_STRIDE_FLOATS);
  addSample(prof.gpuUpload, performance.now() - tGPU);

  addSample(prof.total, performance.now() - tStart);
  maybeLog();

  return gpuMesh;
}

/**
 * Build a terrain mesh with splat weights (10-float stride).
 * Runs the normal 8-float mesh build, then repacks into 10-float stride
 * adding splat weights computed from surface normal + world height.
 */
export function buildLODSplatMesh(
  chunk: TerrainChunk,
  device: GPUDevice,
  config: TerrainConfig,
  lodLevel: number,
  skirtFaces: number,
  densityFn: DensityFn,
  weightFn: SplatWeightFn,
): Mesh | null {
  const s = config.chunkSize;
  const step = 1 << lodLevel;
  const voxelSize = config.voxelSize;
  const useOverlap = skirtFaces !== 0;
  const ext = useOverlap ? step : 0;
  const gridSize = s + 2 * ext;
  const effectiveSize = gridSize / step;

  // Build density grid
  let densityGrid: Float32Array;
  if (useOverlap) {
    const gs1 = gridSize + 1;
    const gridLen = gs1 * gs1 * gs1;
    densityGrid = getScratchDensity(gridLen);
    const originX = (chunk.cx * s - ext) * voxelSize;
    const originY = (chunk.cy * s - ext) * voxelSize;
    const originZ = (chunk.cz * s - ext) * voxelSize;
    for (let z = 0; z <= gridSize; z += step) {
      for (let y = 0; y <= gridSize; y += step) {
        for (let x = 0; x <= gridSize; x += step) {
          densityGrid[z * gs1 * gs1 + y * gs1 + x] = densityFn(
            originX + x * voxelSize,
            originY + y * voxelSize,
            originZ + z * voxelSize,
          );
        }
      }
    }
  } else {
    densityGrid = chunk.densityGrid;
  }

  const maxVerts = maxTriangles(effectiveSize) * 3;
  const scratchVerts = getScratchVerts(maxVerts * VERTEX_STRIDE_FLOATS);
  const scratchIdx = getScratchIdx(maxVerts);

  const meshData = extractSurfaceLOD(
    densityGrid, gridSize, step, voxelSize, config.isoLevel,
    scratchVerts, scratchIdx,
  );

  if (meshData.vertexCount === 0 || meshData.indexCount === 0) return null;

  // Offset vertices back to chunk-local space
  if (useOverlap) {
    const offset = ext * voxelSize;
    for (let vi = 0; vi < meshData.vertexCount; vi++) {
      const o = vi * VERTEX_STRIDE_FLOATS;
      scratchVerts[o] -= offset;
      scratchVerts[o + 1] -= offset;
      scratchVerts[o + 2] -= offset;
    }
  }

  // Compute normals
  if (lodLevel <= 1 && config.smoothNormals) {
    const originX = chunk.cx * s * voxelSize;
    const originY = chunk.cy * s * voxelSize;
    const originZ = chunk.cz * s * voxelSize;
    const worldDensity: DensityFn = (x, y, z) =>
      densityFn(x + originX, y + originY, z + originZ);
    computeGradientNormals(
      scratchVerts, meshData.vertexCount, worldDensity, config.normalEpsilon,
    );
  } else {
    computeTriangleNormals(
      scratchVerts, scratchIdx, meshData.vertexCount, meshData.indexCount,
    );
  }

  computeTriplanarUVs(scratchVerts, meshData.vertexCount);

  // Repack 8-float → 10-float stride with splat weights
  const chunkOriginY = chunk.cy * s * voxelSize;
  const splatVerts = getScratchSplatVerts(meshData.vertexCount * TERRAIN_VERTEX_STRIDE_FLOATS);
  for (let vi = 0; vi < meshData.vertexCount; vi++) {
    const src = vi * VERTEX_STRIDE_FLOATS;
    const dst = vi * TERRAIN_VERTEX_STRIDE_FLOATS;
    // Copy pos(3) + normal(3) + uv(2)
    splatVerts[dst] = scratchVerts[src]!;
    splatVerts[dst + 1] = scratchVerts[src + 1]!;
    splatVerts[dst + 2] = scratchVerts[src + 2]!;
    splatVerts[dst + 3] = scratchVerts[src + 3]!;
    splatVerts[dst + 4] = scratchVerts[src + 4]!;
    splatVerts[dst + 5] = scratchVerts[src + 5]!;
    splatVerts[dst + 6] = scratchVerts[src + 6]!;
    splatVerts[dst + 7] = scratchVerts[src + 7]!;
    // Compute splat weights from normal + world Y
    const nx = scratchVerts[src + 3]!;
    const ny = scratchVerts[src + 4]!;
    const nz = scratchVerts[src + 5]!;
    const worldY = scratchVerts[src + 1]! + chunkOriginY;
    const [w0, w1] = weightFn(nx, ny, nz, worldY);
    splatVerts[dst + 8] = w0;
    splatVerts[dst + 9] = w1;
  }

  const trimmedSplat = splatVerts.subarray(0, meshData.vertexCount * TERRAIN_VERTEX_STRIDE_FLOATS);
  const trimmedIdx = scratchIdx.subarray(0, meshData.indexCount);

  const gpuMesh = createMesh(device, trimmedSplat, trimmedIdx, TERRAIN_VERTEX_STRIDE_FLOATS);
  gpuMesh.bounds = computeBoundingSphere(trimmedSplat, TERRAIN_VERTEX_STRIDE_FLOATS);
  return gpuMesh;
}
