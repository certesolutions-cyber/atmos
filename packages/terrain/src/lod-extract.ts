import { EDGE_TABLE, TRI_TABLE, CORNER_OFFSETS, EDGE_CORNERS } from './marching-cubes-tables.js';
import type { MeshData } from './types.js';

/** Stride in floats: pos(3) + normal(3) + uv(2) */
const STRIDE = 8;

// --- Pooled edge caches (reused across calls, grown as needed) ---
let _poolXEdge: Int32Array | null = null;
let _poolYEdge: Int32Array | null = null;
let _poolZEdge: Int32Array | null = null;

function getEdgeCache(pool: Int32Array | null, minLen: number): Int32Array {
  if (!pool || pool.length < minLen) {
    return new Int32Array(minLen);
  }
  return pool;
}

/**
 * Extract an isosurface at reduced resolution by stepping through
 * the full-resolution density grid with a given stride.
 *
 * step=1 is identical to the regular extractSurface.
 * step=2 produces half-resolution (LOD 1).
 * step=4 produces quarter-resolution (LOD 2).
 *
 * Positions are still in chunk-local space (0 → size*voxelSize).
 *
 * @param densityGrid Full-resolution (size+1)^3 density grid.
 * @param size Original grid size (e.g. 16).
 * @param step Sampling stride: 1, 2, or 4.
 * @param voxelSize World-space size of each voxel.
 * @param isoLevel Density threshold.
 * @param outVertices Pre-allocated vertex buffer.
 * @param outIndices Pre-allocated index buffer.
 */
export function extractSurfaceLOD(
  densityGrid: Float32Array,
  size: number,
  step: number,
  voxelSize: number,
  isoLevel: number,
  outVertices: Float32Array,
  outIndices: Uint32Array,
): MeshData {
  const s1 = size + 1;
  const s1s1 = s1 * s1;

  // Effective grid dimensions at this LOD
  const effectiveSize = size / step;
  const es1 = effectiveSize + 1;

  // Reuse pooled edge caches, fill with -1
  const xLen = effectiveSize * es1 * es1;
  const yLen = es1 * effectiveSize * es1;
  const zLen = es1 * es1 * effectiveSize;
  _poolXEdge = getEdgeCache(_poolXEdge, xLen);
  _poolYEdge = getEdgeCache(_poolYEdge, yLen);
  _poolZEdge = getEdgeCache(_poolZEdge, zLen);
  const xEdge = _poolXEdge;
  const yEdge = _poolYEdge;
  const zEdge = _poolZEdge;
  xEdge.fill(-1, 0, xLen);
  yEdge.fill(-1, 0, yLen);
  zEdge.fill(-1, 0, zLen);

  let vertCount = 0;
  let idxCount = 0;

  // Scratch — tiny, no pooling needed
  let cubeIndex = 0;
  const cornerDensity = new Float32Array(8);
  const edgeVerts = new Int32Array(12);

  // Iterate in effective-grid coordinates (ex, ey, ez)
  for (let ez = 0; ez < effectiveSize; ez++) {
    for (let ey = 0; ey < effectiveSize; ey++) {
      for (let ex = 0; ex < effectiveSize; ex++) {
        // Map to full-grid coordinates
        const gxBase = ex * step;
        const gyBase = ey * step;
        const gzBase = ez * step;

        // Gather 8 corner densities from the full grid
        cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const co = CORNER_OFFSETS[c]!;
          const gx = gxBase + co[0] * step;
          const gy = gyBase + co[1] * step;
          const gz = gzBase + co[2] * step;
          const d = densityGrid[gz * s1s1 + gy * s1 + gx]!;
          cornerDensity[c] = d;
          if (d < isoLevel) cubeIndex |= (1 << c);
        }

        const edgeBits = EDGE_TABLE[cubeIndex]!;
        if (edgeBits === 0) continue;

        for (let e = 0; e < 12; e++) {
          if ((edgeBits & (1 << e)) === 0) {
            edgeVerts[e] = -1;
            continue;
          }

          const ec = EDGE_CORNERS[e]!;
          const c0 = ec[0];
          const c1 = ec[1];

          // Check cache using effective-grid coords
          const cached = getCachedEdgeLOD(
            e, ex, ey, ez, es1, effectiveSize, xEdge, yEdge, zEdge,
          );
          if (cached >= 0) {
            edgeVerts[e] = cached;
            continue;
          }

          // Interpolate in full-grid space, then convert to world
          const d0 = cornerDensity[c0]!;
          const d1 = cornerDensity[c1]!;
          const denom = d0 - d1;
          const t = Math.abs(denom) < 1e-10 ? 0.5 : (d0 - isoLevel) / denom;

          const co0 = CORNER_OFFSETS[c0]!;
          const co1 = CORNER_OFFSETS[c1]!;
          // Position in full-grid units, then multiply by voxelSize
          const px = (gxBase + co0[0] * step + t * (co1[0] - co0[0]) * step) * voxelSize;
          const py = (gyBase + co0[1] * step + t * (co1[1] - co0[1]) * step) * voxelSize;
          const pz = (gzBase + co0[2] * step + t * (co1[2] - co0[2]) * step) * voxelSize;

          const o = vertCount * STRIDE;
          outVertices[o] = px;
          outVertices[o + 1] = py;
          outVertices[o + 2] = pz;
          outVertices[o + 3] = 0;
          outVertices[o + 4] = 1;
          outVertices[o + 5] = 0;
          outVertices[o + 6] = 0;
          outVertices[o + 7] = 0;

          edgeVerts[e] = vertCount;
          setCachedEdgeLOD(
            e, ex, ey, ez, es1, effectiveSize, xEdge, yEdge, zEdge, vertCount,
          );
          vertCount++;
        }

        // Emit triangles
        const triBase = cubeIndex * 16;
        for (let ti = 0; ti < 15; ti += 3) {
          const e0 = TRI_TABLE[triBase + ti]!;
          if (e0 === -1) break;
          const e1 = TRI_TABLE[triBase + ti + 1]!;
          const e2 = TRI_TABLE[triBase + ti + 2]!;
          outIndices[idxCount++] = edgeVerts[e0]!;
          outIndices[idxCount++] = edgeVerts[e1]!;
          outIndices[idxCount++] = edgeVerts[e2]!;
        }
      }
    }
  }

  return {
    vertices: outVertices,
    indices: outIndices,
    vertexCount: vertCount,
    indexCount: idxCount,
  };
}

// --- Edge cache helpers (same logic as marching-cubes.ts but for effective grid) ---

function edgeDirection(e: number): number {
  if (e === 0 || e === 2 || e === 4 || e === 6) return 0;
  if (e === 1 || e === 3 || e === 5 || e === 7) return 2;
  return 1;
}

function edgeOriginLOD(
  e: number, x: number, y: number, z: number,
): [number, number, number] {
  const ec = EDGE_CORNERS[e]!;
  const co0 = CORNER_OFFSETS[ec[0]]!;
  const co1 = CORNER_OFFSETS[ec[1]]!;
  const dir = edgeDirection(e);
  const co = co0[dir]! <= co1[dir]! ? co0 : co1;
  return [x + co[0], y + co[1], z + co[2]];
}

function getCachedEdgeLOD(
  e: number, x: number, y: number, z: number,
  s1: number, size: number,
  xEdge: Int32Array, yEdge: Int32Array, zEdge: Int32Array,
): number {
  const [ox, oy, oz] = edgeOriginLOD(e, x, y, z);
  const dir = edgeDirection(e);
  if (dir === 0) return xEdge[oz * s1 * size + oy * size + ox]!;
  if (dir === 1) return yEdge[oz * size * s1 + oy * s1 + ox]!;
  return zEdge[oz * s1 * s1 + oy * s1 + ox]!;
}

function setCachedEdgeLOD(
  e: number, x: number, y: number, z: number,
  s1: number, size: number,
  xEdge: Int32Array, yEdge: Int32Array, zEdge: Int32Array,
  vertexIndex: number,
): void {
  const [ox, oy, oz] = edgeOriginLOD(e, x, y, z);
  const dir = edgeDirection(e);
  if (dir === 0) {
    xEdge[oz * s1 * size + oy * size + ox] = vertexIndex;
  } else if (dir === 1) {
    yEdge[oz * size * s1 + oy * s1 + ox] = vertexIndex;
  } else {
    zEdge[oz * s1 * s1 + oy * s1 + ox] = vertexIndex;
  }
}
