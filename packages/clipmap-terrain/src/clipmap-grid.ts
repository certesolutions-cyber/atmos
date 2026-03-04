/**
 * CPU-side grid mesh generation for geometry clipmap terrain.
 *
 * Level 0 = full grid (gridSize × gridSize).
 * Levels 1+ = ring grid (inner hole cut out, filled by the finer level).
 *
 * Vertex format: 2 floats (ix, iz) — integer grid coordinates.
 * World position is computed in the vertex shader: origin + gridCoord * scale.
 *
 * Stitch mode: outer boundary cells use a stitched triangulation that matches
 * the coarser ring's vertex spacing (every 2nd vertex), eliminating cracks
 * between LOD rings by construction.
 */

import type { ClipmapGridData } from './types.js';

/**
 * Emit stitched triangles for a pair of cells along a boundary edge.
 * The pair shares one coarse outer vertex, creating 3 triangles instead of 4.
 *
 * For a top-edge pair at columns (x, x+1), z=0:
 *   Outer row: V[x] . V[x+2]      (skip odd outer vertex)
 *   Inner row: v[x] v[x+1] v[x+2]
 *   → 3 triangles: (O_left, I_left, I_mid), (O_left, I_mid, O_right), (O_right, I_mid, I_right)
 *
 * Other edges are rotated versions of the same pattern.
 */

/* ── Full grid ────────────────────────────────────────────────────────── */

/**
 * Generate a full grid mesh (level 0).
 * @param gridSize Vertices per side (e.g. 63, must be odd).
 * @param stitch If true, outer boundary uses stitched triangulation matching
 *               the coarser ring's vertex spacing. Default true.
 */
export function createFullGrid(gridSize: number, stitch = true): ClipmapGridData {
  const vertexCount = gridSize * gridSize;
  const cellsPerSide = gridSize - 1;

  // Vertices: grid coordinates centered around 0
  const half = (gridSize - 1) / 2;
  const vertices = new Float32Array(vertexCount * 2);
  let vi = 0;
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      vertices[vi++] = x - half;
      vertices[vi++] = z - half;
    }
  }

  if (!stitch) {
    // No stitching: simple 2-triangle-per-cell
    const indexCount = cellsPerSide * cellsPerSide * 6;
    const indices = new Uint32Array(indexCount);
    let ii = 0;
    for (let z = 0; z < cellsPerSide; z++) {
      for (let x = 0; x < cellsPerSide; x++) {
        const tl = z * gridSize + x;
        const tr = tl + 1;
        const bl = tl + gridSize;
        const br = bl + 1;
        indices[ii++] = tl;
        indices[ii++] = bl;
        indices[ii++] = tr;
        indices[ii++] = tr;
        indices[ii++] = bl;
        indices[ii++] = br;
      }
    }
    return { vertices, indices, vertexCount, indexCount };
  }

  // Stitched: collect indices into array, then compact
  const indices = emitStitchedIndices(gridSize, cellsPerSide, null, null);
  return { vertices, indices, vertexCount, indexCount: indices.length };
}

/* ── Ring grid ────────────────────────────────────────────────────────── */

/**
 * Generate a ring grid mesh (levels 1+).
 * Inner hole is cut out — it's covered by the finer level.
 *
 * @param gridSize Vertices per side (should be odd for symmetric hole).
 * @param stitch If true, outer boundary uses stitched triangulation. Default true.
 */
export function createRingGrid(gridSize: number, stitch = true): ClipmapGridData {
  const half = (gridSize - 1) / 2;
  const holeHalf = Math.floor((gridSize - 1) / 4) - 1;
  const holeMin = half - holeHalf;
  const holeMax = half + holeHalf;

  // All vertices still emitted (same as full grid)
  const vertexCount = gridSize * gridSize;
  const vertices = new Float32Array(vertexCount * 2);
  let vi = 0;
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      vertices[vi++] = x - half;
      vertices[vi++] = z - half;
    }
  }

  const cellsPerSide = gridSize - 1;

  if (!stitch) {
    // No stitching, just skip hole cells
    let cellCount = 0;
    for (let z = 0; z < cellsPerSide; z++) {
      for (let x = 0; x < cellsPerSide; x++) {
        if (x >= holeMin && x < holeMax && z >= holeMin && z < holeMax) continue;
        cellCount++;
      }
    }
    const indexCount = cellCount * 6;
    const indices = new Uint32Array(indexCount);
    let ii = 0;
    for (let z = 0; z < cellsPerSide; z++) {
      for (let x = 0; x < cellsPerSide; x++) {
        if (x >= holeMin && x < holeMax && z >= holeMin && z < holeMax) continue;
        const tl = z * gridSize + x;
        const tr = tl + 1;
        const bl = tl + gridSize;
        const br = bl + 1;
        indices[ii++] = tl;
        indices[ii++] = bl;
        indices[ii++] = tr;
        indices[ii++] = tr;
        indices[ii++] = bl;
        indices[ii++] = br;
      }
    }
    return { vertices, indices, vertexCount, indexCount };
  }

  // Stitched with hole
  const hole = { min: holeMin, max: holeMax };
  const indices = emitStitchedIndices(gridSize, cellsPerSide, hole, null);
  return { vertices, indices, vertexCount, indexCount: indices.length };
}

/* ── Stitch index generation ──────────────────────────────────────────── */

interface HoleRect { min: number; max: number; }

/**
 * Generate all triangle indices with stitched outer boundary.
 *
 * Stitching: on each outer edge, pairs of cells (even,odd) are merged.
 * The outer-edge vertex between them is skipped, and 3 triangles cover
 * the two-cell-wide strip instead of the normal 4.
 *
 * gridSize must be odd so cellsPerSide is even, ensuring clean pairing.
 */
function emitStitchedIndices(
  gridSize: number,
  cellsPerSide: number,
  hole: HoleRect | null,
  _unused: null,
): Uint32Array {
  const buf: number[] = [];

  // Track which cells are consumed by stitch pairs
  const stitched = new Uint8Array(cellsPerSide * cellsPerSide);

  // Mark and emit stitch pairs for each outer edge
  emitTopStitch(buf, stitched, gridSize, cellsPerSide, hole);
  emitBottomStitch(buf, stitched, gridSize, cellsPerSide, hole);
  emitLeftStitch(buf, stitched, gridSize, cellsPerSide, hole);
  emitRightStitch(buf, stitched, gridSize, cellsPerSide, hole);

  // Interior cells: normal 2-triangle quads
  for (let z = 0; z < cellsPerSide; z++) {
    for (let x = 0; x < cellsPerSide; x++) {
      if (stitched[z * cellsPerSide + x]) continue;
      if (hole && x >= hole.min && x < hole.max && z >= hole.min && z < hole.max) continue;

      const tl = z * gridSize + x;
      const tr = tl + 1;
      const bl = tl + gridSize;
      const br = bl + 1;
      buf.push(tl, bl, tr);
      buf.push(tr, bl, br);
    }
  }

  return new Uint32Array(buf);
}

/** vertex index helper */
function vtx(gridSize: number, x: number, z: number): number {
  return z * gridSize + x;
}

function isHoleCell(x: number, z: number, hole: HoleRect | null): boolean {
  if (!hole) return false;
  return x >= hole.min && x < hole.max && z >= hole.min && z < hole.max;
}

/* ── Top edge stitch (z=0) ──────────────────────────────────────────── */

function emitTopStitch(
  buf: number[], stitched: Uint8Array,
  gridSize: number, cellsPerSide: number, hole: HoleRect | null,
): void {
  const z = 0;
  for (let x = 0; x < cellsPerSide; x += 2) {
    if (isHoleCell(x, z, hole) && isHoleCell(x + 1, z, hole)) continue;

    // Outer (z=0) vertices: x, x+2 (skip x+1)
    // Inner (z=1) vertices: x, x+1, x+2
    const oL = vtx(gridSize, x, 0);
    const oR = vtx(gridSize, x + 2, 0);
    const iL = vtx(gridSize, x, 1);
    const iM = vtx(gridSize, x + 1, 1);
    const iR = vtx(gridSize, x + 2, 1);

    // 3 triangles (CCW from top-down view)
    buf.push(oL, iL, iM);
    buf.push(oL, iM, oR);
    buf.push(oR, iM, iR);

    stitched[z * cellsPerSide + x] = 1;
    if (x + 1 < cellsPerSide) stitched[z * cellsPerSide + x + 1] = 1;
  }
}

/* ── Bottom edge stitch (z=cellsPerSide-1) ──────────────────────────── */

function emitBottomStitch(
  buf: number[], stitched: Uint8Array,
  gridSize: number, cellsPerSide: number, hole: HoleRect | null,
): void {
  const z = cellsPerSide - 1;
  for (let x = 0; x < cellsPerSide; x += 2) {
    if (isHoleCell(x, z, hole) && isHoleCell(x + 1, z, hole)) continue;

    // Outer (z=gridSize-1) vertices: x, x+2
    // Inner (z=gridSize-2) vertices: x, x+1, x+2
    const oL = vtx(gridSize, x, gridSize - 1);
    const oR = vtx(gridSize, x + 2, gridSize - 1);
    const iL = vtx(gridSize, x, gridSize - 2);
    const iM = vtx(gridSize, x + 1, gridSize - 2);
    const iR = vtx(gridSize, x + 2, gridSize - 2);

    // 3 triangles (CCW: inner row is "above" outer row in grid space)
    buf.push(iL, oL, iM);
    buf.push(iM, oL, oR);
    buf.push(iM, oR, iR);

    stitched[z * cellsPerSide + x] = 1;
    if (x + 1 < cellsPerSide) stitched[z * cellsPerSide + x + 1] = 1;
  }
}

/* ── Left edge stitch (x=0) ─────────────────────────────────────────── */

function emitLeftStitch(
  buf: number[], stitched: Uint8Array,
  gridSize: number, cellsPerSide: number, hole: HoleRect | null,
): void {
  const x = 0;
  for (let z = 0; z < cellsPerSide; z += 2) {
    // Skip if already consumed by corner (top-left or bottom-left)
    if (stitched[z * cellsPerSide + x]) continue;
    if (isHoleCell(x, z, hole) && isHoleCell(x, z + 1, hole)) continue;

    // Outer (x=0) vertices: z, z+2
    // Inner (x=1) vertices: z, z+1, z+2
    const oT = vtx(gridSize, 0, z);
    const oB = vtx(gridSize, 0, z + 2);
    const iT = vtx(gridSize, 1, z);
    const iM = vtx(gridSize, 1, z + 1);
    const iB = vtx(gridSize, 1, z + 2);

    // 3 triangles (CCW)
    buf.push(oT, oB, iM);
    buf.push(oT, iM, iT);
    buf.push(iM, oB, iB);

    stitched[z * cellsPerSide + x] = 1;
    if (z + 1 < cellsPerSide) stitched[(z + 1) * cellsPerSide + x] = 1;
  }
}

/* ── Right edge stitch (x=cellsPerSide-1) ───────────────────────────── */

function emitRightStitch(
  buf: number[], stitched: Uint8Array,
  gridSize: number, cellsPerSide: number, hole: HoleRect | null,
): void {
  const x = cellsPerSide - 1;
  for (let z = 0; z < cellsPerSide; z += 2) {
    if (stitched[z * cellsPerSide + x]) continue;
    if (isHoleCell(x, z, hole) && isHoleCell(x, z + 1, hole)) continue;

    // Outer (x=gridSize-1) vertices: z, z+2
    // Inner (x=gridSize-2) vertices: z, z+1, z+2
    const oT = vtx(gridSize, gridSize - 1, z);
    const oB = vtx(gridSize, gridSize - 1, z + 2);
    const iT = vtx(gridSize, gridSize - 2, z);
    const iM = vtx(gridSize, gridSize - 2, z + 1);
    const iB = vtx(gridSize, gridSize - 2, z + 2);

    // 3 triangles (CCW)
    buf.push(oT, iT, iM);
    buf.push(oT, iM, oB);
    buf.push(oB, iM, iB);

    stitched[z * cellsPerSide + x] = 1;
    if (z + 1 < cellsPerSide) stitched[(z + 1) * cellsPerSide + x] = 1;
  }
}
