import { EDGE_TABLE, TRI_TABLE, CORNER_OFFSETS, EDGE_CORNERS } from './marching-cubes-tables.js';
import type { MeshData } from './types.js';

/** Stride in floats: pos(3) + normal(3) + uv(2) */
const STRIDE = 8;

/**
 * Extract an isosurface from a flat density grid using marching cubes.
 *
 * @param densityGrid Flat Float32Array of (size+1)^3 density values,
 *   indexed as z*(s+1)*(s+1) + y*(s+1) + x. Positive = air, negative = solid.
 * @param size Number of voxels per axis (grid has size+1 samples per axis).
 * @param voxelSize World-space size of each voxel.
 * @param isoLevel Density threshold (default 0).
 * @param outVertices Pre-allocated vertex buffer (caller-owned).
 * @param outIndices Pre-allocated index buffer (caller-owned).
 * @returns MeshData with counts; vertices have placeholder normals (0,1,0) and triplanar UVs.
 */
export function extractSurface(
  densityGrid: Float32Array,
  size: number,
  voxelSize: number,
  isoLevel: number,
  outVertices: Float32Array,
  outIndices: Uint32Array,
): MeshData {
  const s1 = size + 1;
  const s1s1 = s1 * s1;

  // Edge vertex caches: one index per edge in each direction.
  // X-edges: size edges per row, s1 rows per slice, s1 slices = size * s1 * s1
  // Y-edges: s1 * size * s1
  // Z-edges: s1 * s1 * size
  const xEdge = new Int32Array(size * s1 * s1).fill(-1);
  const yEdge = new Int32Array(s1 * size * s1).fill(-1);
  const zEdge = new Int32Array(s1 * s1 * size).fill(-1);

  let vertCount = 0;
  let idxCount = 0;

  // Scratch for 8 corner densities and 12 edge vertex indices
  const cornerDensity = new Float32Array(8);
  const edgeVerts = new Int32Array(12);

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Gather 8 corner densities
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const co = CORNER_OFFSETS[c]!;
          const gx = x + co[0];
          const gy = y + co[1];
          const gz = z + co[2];
          const d = densityGrid[gz * s1s1 + gy * s1 + gx]!;
          cornerDensity[c] = d;
          if (d < isoLevel) cubeIndex |= (1 << c);
        }

        const edgeBits = EDGE_TABLE[cubeIndex]!;
        if (edgeBits === 0) continue;

        // For each active edge, compute or retrieve the interpolated vertex
        for (let e = 0; e < 12; e++) {
          if ((edgeBits & (1 << e)) === 0) {
            edgeVerts[e] = -1;
            continue;
          }

          const ec = EDGE_CORNERS[e]!;
          const c0 = ec[0];
          const c1 = ec[1];

          // Look up in directional cache
          const cached = getCachedEdge(e, x, y, z, s1, size, xEdge, yEdge, zEdge);
          if (cached >= 0) {
            edgeVerts[e] = cached;
            continue;
          }

          // Interpolate
          const d0 = cornerDensity[c0]!;
          const d1 = cornerDensity[c1]!;
          const denom = d0 - d1;
          const t = Math.abs(denom) < 1e-10 ? 0.5 : (d0 - isoLevel) / denom;

          const co0 = CORNER_OFFSETS[c0]!;
          const co1 = CORNER_OFFSETS[c1]!;
          const px = (x + co0[0] + t * (co1[0] - co0[0])) * voxelSize;
          const py = (y + co0[1] + t * (co1[1] - co0[1])) * voxelSize;
          const pz = (z + co0[2] + t * (co1[2] - co0[2])) * voxelSize;

          // Triplanar UVs (will be replaced by normals pass, using dominant axis)
          const o = vertCount * STRIDE;
          outVertices[o] = px;
          outVertices[o + 1] = py;
          outVertices[o + 2] = pz;
          // Placeholder normal (0, 1, 0) — replaced by terrain-normals pass
          outVertices[o + 3] = 0;
          outVertices[o + 4] = 1;
          outVertices[o + 5] = 0;
          // Triplanar UV placeholder (will be computed after normals)
          outVertices[o + 6] = 0;
          outVertices[o + 7] = 0;

          edgeVerts[e] = vertCount;
          setCachedEdge(e, x, y, z, s1, size, xEdge, yEdge, zEdge, vertCount);
          vertCount++;
        }

        // Emit triangles
        const triBase = cubeIndex * 16;
        for (let t = 0; t < 15; t += 3) {
          const e0 = TRI_TABLE[triBase + t]!;
          if (e0 === -1) break;
          const e1 = TRI_TABLE[triBase + t + 1]!;
          const e2 = TRI_TABLE[triBase + t + 2]!;
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

/** Compute triplanar UVs for vertices based on their normals. */
export function computeTriplanarUVs(
  vertices: Float32Array,
  vertexCount: number,
  uvScale: number = 1,
): void {
  for (let i = 0; i < vertexCount; i++) {
    const o = i * STRIDE;
    const px = vertices[o]!;
    const py = vertices[o + 1]!;
    const pz = vertices[o + 2]!;
    const nx = Math.abs(vertices[o + 3]!);
    const ny = Math.abs(vertices[o + 4]!);
    const nz = Math.abs(vertices[o + 5]!);

    // Choose dominant axis for UV projection
    if (nx >= ny && nx >= nz) {
      // X-dominant: project onto YZ
      vertices[o + 6] = pz * uvScale;
      vertices[o + 7] = py * uvScale;
    } else if (ny >= nz) {
      // Y-dominant: project onto XZ
      vertices[o + 6] = px * uvScale;
      vertices[o + 7] = pz * uvScale;
    } else {
      // Z-dominant: project onto XY
      vertices[o + 6] = px * uvScale;
      vertices[o + 7] = py * uvScale;
    }
  }
}

// --- Edge cache helpers ---
// Edges are categorized by direction:
// Edges 0,2,4,6 → X direction (along x-axis)
// Edges 8,9,10,11 → Y direction (along y-axis)
// Edges 1,3,5,7 → Z direction (along z-axis)
// (Derived from which axis differs between the two corners.)

function edgeDirection(e: number): number {
  // X-edges: 0(0→1), 2(3→2), 4(4→5), 6(7→6) — x changes
  // Z-edges: 1(1→2), 3(0→3), 5(5→6), 7(4→7) — z changes
  // Y-edges: 8(0→4), 9(1→5), 10(2→6), 11(3→7) — y changes
  if (e === 0 || e === 2 || e === 4 || e === 6) return 0; // X
  if (e === 1 || e === 3 || e === 5 || e === 7) return 2; // Z
  return 1; // Y (8,9,10,11)
}

/**
 * Return the canonical grid origin of an edge: the endpoint with the
 * smaller coordinate value along the edge's direction.
 * This ensures two adjacent cubes sharing the same physical edge
 * always compute the same cache key.
 */
function edgeOrigin(
  e: number, x: number, y: number, z: number,
): [number, number, number] {
  const ec = EDGE_CORNERS[e]!;
  const co0 = CORNER_OFFSETS[ec[0]]!;
  const co1 = CORNER_OFFSETS[ec[1]]!;
  const dir = edgeDirection(e);
  // Pick the corner with the lower value along the edge direction
  const co = co0[dir]! <= co1[dir]! ? co0 : co1;
  return [x + co[0], y + co[1], z + co[2]];
}

function getCachedEdge(
  e: number, x: number, y: number, z: number,
  s1: number, size: number,
  xEdge: Int32Array, yEdge: Int32Array, zEdge: Int32Array,
): number {
  const [ox, oy, oz] = edgeOrigin(e, x, y, z);
  const dir = edgeDirection(e);
  if (dir === 0) {
    // X-edge: index = oz * s1 * size + oy * size + ox
    return xEdge[oz * s1 * size + oy * size + ox]!;
  } else if (dir === 1) {
    // Y-edge: index = oz * s1 * s1 + oy * s1 + ox  (but oy ranges [0..size-1])
    return yEdge[oz * size * s1 + oy * s1 + ox]!;
  } else {
    // Z-edge: index = oz * s1 * s1 + oy * s1 + ox
    return zEdge[oz * s1 * s1 + oy * s1 + ox]!;
  }
}

function setCachedEdge(
  e: number, x: number, y: number, z: number,
  s1: number, size: number,
  xEdge: Int32Array, yEdge: Int32Array, zEdge: Int32Array,
  vertexIndex: number,
): void {
  const [ox, oy, oz] = edgeOrigin(e, x, y, z);
  const dir = edgeDirection(e);
  if (dir === 0) {
    xEdge[oz * s1 * size + oy * size + ox] = vertexIndex;
  } else if (dir === 1) {
    yEdge[oz * size * s1 + oy * s1 + ox] = vertexIndex;
  } else {
    zEdge[oz * s1 * s1 + oy * s1 + ox] = vertexIndex;
  }
}
