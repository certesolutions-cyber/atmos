/**
 * Billboard LOD mesh: single quad for impostor rendering.
 * The vertex shader rotates it to face the camera.
 */

export interface BillboardMeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * Create a billboard mesh of 1 quad (4 vertices, 6 indices).
 * The quad lies in the XY plane, centered on X at centerX.
 * The impostor vertex shader rotates it to face the camera at runtime.
 *
 * @param width  Billboard width in world units.
 * @param height Billboard height in world units.
 * @param yOffset Vertical offset for the bottom edge.
 * @param centerX Horizontal center offset (typically 0 for impostor).
 */
export function createBillboardMesh(width: number, height: number, yOffset = 0, centerX = 0): BillboardMeshData {
  const hw = width * 0.5;
  const yBottom = yOffset;
  const yTop = yOffset + height;

  // Normal points +Z (front face); the vertex shader handles camera-facing rotation
  const nx = 0, ny = 0, nz = 1;

  // 4 vertices: pos(3) + normal(3) + uv(2) + windWeight(1) + branchLevel(1) = 10 floats
  const vertices = new Float32Array([
    // bottom-left
    centerX - hw, yBottom, 0,  nx, ny, nz,  0, 0,  0, 1,
    // bottom-right
    centerX + hw, yBottom, 0,  nx, ny, nz,  1, 0,  0, 1,
    // top-right
    centerX + hw, yTop, 0,     nx, ny, nz,  1, 1,  1, 1,
    // top-left
    centerX - hw, yTop, 0,     nx, ny, nz,  0, 1,  1, 1,
  ]);

  // CCW winding
  const indices = new Uint32Array([
    0, 2, 1,
    0, 3, 2,
  ]);

  return { vertices, indices };
}
