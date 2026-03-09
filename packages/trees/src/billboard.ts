/**
 * Billboard LOD mesh: 2 crossed quads forming an X shape.
 * Used for distant tree rendering.
 */

export interface BillboardMeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * Create a billboard mesh of 2 crossed quads.
 * 8 vertices, 12 indices (4 triangles).
 * @param yOffset Vertical offset for the bottom edge (aligns billboard with capture ortho).
 * @param centerX AABB center X from the capture's ortho projection. Both quads use this
 *   offset (X for Quad 1, Z for Quad 2) because both share the same texture captured
 *   from the -Z direction, so the trunk root's horizontal position in the texture
 *   is determined by cx regardless of viewing angle.
 */
export function createBillboardMesh(width: number, height: number, yOffset = 0, centerX = 0): BillboardMeshData {
  const hw = width * 0.5;
  const yBottom = yOffset;
  const yTop = yOffset + height;
  const verts: number[] = [];
  const indices: number[] = [];

  // Quad 1: aligned to XY plane (normal = +Z), shifted by centerX
  addQuad(verts, indices, 0,
    centerX - hw, yBottom, 0,  centerX + hw, yBottom, 0,  centerX + hw, yTop, 0,  centerX - hw, yTop, 0,
    0, 0, 1,
  );

  // Quad 2: aligned to ZY plane (normal = +X), shifted by centerX in Z
  // (same texture, same horizontal trunk position)
  addQuad(verts, indices, 4,
    0, yBottom, centerX - hw,  0, yBottom, centerX + hw,  0, yTop, centerX + hw,  0, yTop, centerX - hw,
    1, 0, 0,
  );

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(indices),
  };
}

function addQuad(
  verts: number[], indices: number[], baseIdx: number,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  nx: number, ny: number, nz: number,
): void {
  // 4 vertices with UVs
  const corners = [
    [x0, y0, z0, 0, 0],
    [x1, y1, z1, 1, 0],
    [x2, y2, z2, 1, 1],
    [x3, y3, z3, 0, 1],
  ] as const;

  for (const [x, y, z, u, v] of corners) {
    // windWeight based on relative height (0 at bottom, 1 at top)
    const windWeight = (y - y0) / Math.max(y2 - y0, 0.001);
    verts.push(x, y, z, nx, ny, nz, u, v, windWeight, 1.0);
  }

  // CCW winding so front face matches the declared normal direction
  indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
  indices.push(baseIdx, baseIdx + 3, baseIdx + 2);
}
