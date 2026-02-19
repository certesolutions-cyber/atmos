import type { BoundingSphere } from './bounds.js';
import { computeBoundingSphere } from './bounds.js';

export interface GeometryData {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  bounds: BoundingSphere;
}

/** Floats per vertex: position(3) + normal(3) + uv(2) */
export const VERTEX_STRIDE_FLOATS = 8;
/** Bytes per vertex: 8 floats × 4 bytes */
export const VERTEX_STRIDE_BYTES = 32;

/** Push a single vertex into the array at the given float offset. */
function pushVert(
  arr: Float32Array,
  offset: number,
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  u: number, v: number,
): void {
  arr[offset] = px; arr[offset + 1] = py; arr[offset + 2] = pz;
  arr[offset + 3] = nx; arr[offset + 4] = ny; arr[offset + 5] = nz;
  arr[offset + 6] = u;  arr[offset + 7] = v;
}

/**
 * Unit cube centered at origin.
 * 24 vertices (4 per face for face normals), 36 indices.
 */
export function createCubeGeometry(): GeometryData {
  const vertices = new Float32Array(24 * VERTEX_STRIDE_FLOATS);
  let o = 0;

  // Front face (+Z)
  pushVert(vertices, o, -0.5, -0.5,  0.5,  0, 0, 1,  0, 0); o += 8;
  pushVert(vertices, o,  0.5, -0.5,  0.5,  0, 0, 1,  1, 0); o += 8;
  pushVert(vertices, o,  0.5,  0.5,  0.5,  0, 0, 1,  1, 1); o += 8;
  pushVert(vertices, o, -0.5,  0.5,  0.5,  0, 0, 1,  0, 1); o += 8;

  // Back face (-Z)
  pushVert(vertices, o,  0.5, -0.5, -0.5,  0, 0, -1,  0, 0); o += 8;
  pushVert(vertices, o, -0.5, -0.5, -0.5,  0, 0, -1,  1, 0); o += 8;
  pushVert(vertices, o, -0.5,  0.5, -0.5,  0, 0, -1,  1, 1); o += 8;
  pushVert(vertices, o,  0.5,  0.5, -0.5,  0, 0, -1,  0, 1); o += 8;

  // Top face (+Y)
  pushVert(vertices, o, -0.5,  0.5,  0.5,  0, 1, 0,  0, 0); o += 8;
  pushVert(vertices, o,  0.5,  0.5,  0.5,  0, 1, 0,  1, 0); o += 8;
  pushVert(vertices, o,  0.5,  0.5, -0.5,  0, 1, 0,  1, 1); o += 8;
  pushVert(vertices, o, -0.5,  0.5, -0.5,  0, 1, 0,  0, 1); o += 8;

  // Bottom face (-Y)
  pushVert(vertices, o, -0.5, -0.5, -0.5,  0, -1, 0,  0, 0); o += 8;
  pushVert(vertices, o,  0.5, -0.5, -0.5,  0, -1, 0,  1, 0); o += 8;
  pushVert(vertices, o,  0.5, -0.5,  0.5,  0, -1, 0,  1, 1); o += 8;
  pushVert(vertices, o, -0.5, -0.5,  0.5,  0, -1, 0,  0, 1); o += 8;

  // Right face (+X)
  pushVert(vertices, o,  0.5, -0.5,  0.5,  1, 0, 0,  0, 0); o += 8;
  pushVert(vertices, o,  0.5, -0.5, -0.5,  1, 0, 0,  1, 0); o += 8;
  pushVert(vertices, o,  0.5,  0.5, -0.5,  1, 0, 0,  1, 1); o += 8;
  pushVert(vertices, o,  0.5,  0.5,  0.5,  1, 0, 0,  0, 1); o += 8;

  // Left face (-X)
  pushVert(vertices, o, -0.5, -0.5, -0.5,  -1, 0, 0,  0, 0); o += 8;
  pushVert(vertices, o, -0.5, -0.5,  0.5,  -1, 0, 0,  1, 0); o += 8;
  pushVert(vertices, o, -0.5,  0.5,  0.5,  -1, 0, 0,  1, 1); o += 8;
  pushVert(vertices, o, -0.5,  0.5, -0.5,  -1, 0, 0,  0, 1); o += 8;

  // prettier-ignore
  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,
     4,  5,  6,   4,  6,  7,
     8,  9, 10,   8, 10, 11,
    12, 13, 14,  12, 14, 15,
    16, 17, 18,  16, 18, 19,
    20, 21, 22,  20, 22, 23,
  ]);

  return { vertices, indices, bounds: computeBoundingSphere(vertices, VERTEX_STRIDE_FLOATS) };
}

/**
 * XZ plane centered at origin.
 */
export function createPlaneGeometry(
  width = 1,
  depth = 1,
  segX = 1,
  segZ = 1,
): GeometryData {
  const vertCount = (segX + 1) * (segZ + 1);
  const vertices = new Float32Array(vertCount * VERTEX_STRIDE_FLOATS);
  let o = 0;

  for (let iz = 0; iz <= segZ; iz++) {
    const v = iz / segZ;
    const z = (v - 0.5) * depth;
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const x = (u - 0.5) * width;
      pushVert(vertices, o, x, 0, z, 0, 1, 0, u, v);
      o += 8;
    }
  }

  const triCount = segX * segZ * 2;
  const indices = new Uint16Array(triCount * 3);
  let idx = 0;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = a + (segX + 1);
      const d = c + 1;
      indices[idx++] = a; indices[idx++] = c; indices[idx++] = b;
      indices[idx++] = b; indices[idx++] = c; indices[idx++] = d;
    }
  }

  return { vertices, indices, bounds: computeBoundingSphere(vertices, VERTEX_STRIDE_FLOATS) };
}

/**
 * UV sphere centered at origin.
 */
export function createSphereGeometry(
  radius = 0.5,
  widthSegments = 16,
  heightSegments = 12,
): GeometryData {
  const vertCount = (widthSegments + 1) * (heightSegments + 1);
  const vertices = new Float32Array(vertCount * VERTEX_STRIDE_FLOATS);
  let o = 0;

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const phi = v * Math.PI;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const theta = u * Math.PI * 2;
      const nx = -Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      pushVert(vertices, o, nx * radius, ny * radius, nz * radius, nx, ny, nz, u, v);
      o += 8;
    }
  }

  const triCount = widthSegments * heightSegments * 2;
  const indices = new Uint16Array(triCount * 3);
  let idx = 0;
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * (widthSegments + 1) + ix;
      const b = a + 1;
      const c = a + (widthSegments + 1);
      const d = c + 1;
      indices[idx++] = a; indices[idx++] = c; indices[idx++] = b;
      indices[idx++] = b; indices[idx++] = c; indices[idx++] = d;
    }
  }

  return { vertices, indices, bounds: computeBoundingSphere(vertices, VERTEX_STRIDE_FLOATS) };
}

/**
 * Cylinder along Y axis, centered at origin.
 */
export function createCylinderGeometry(
  radiusTop = 0.5,
  radiusBottom = 0.5,
  height = 1,
  radialSegments = 16,
): GeometryData {
  const bodyVerts = (radialSegments + 1) * 2;
  const capVerts = (radialSegments + 2) * 2; // top: center + ring(seg+1), bottom: same
  const totalVerts = bodyVerts + capVerts;
  const vertices = new Float32Array(totalVerts * VERTEX_STRIDE_FLOATS);
  let o = 0;

  const halfH = height / 2;
  const slope = radiusBottom - radiusTop;
  const slopeLen = Math.sqrt(slope * slope + height * height);
  const ny = slope / slopeLen;
  const nr = height / slopeLen;

  // Body
  for (let i = 0; i <= radialSegments; i++) {
    const u = i / radialSegments;
    const theta = u * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const nx = cos * nr;
    const nz = sin * nr;
    // Top ring
    pushVert(vertices, o, cos * radiusTop, halfH, sin * radiusTop, nx, ny, nz, u, 0);
    o += 8;
    // Bottom ring
    pushVert(vertices, o, cos * radiusBottom, -halfH, sin * radiusBottom, nx, ny, nz, u, 1);
    o += 8;
  }

  // Top cap
  const topCenterIdx = o / VERTEX_STRIDE_FLOATS;
  pushVert(vertices, o, 0, halfH, 0, 0, 1, 0, 0.5, 0.5);
  o += 8;
  for (let i = 0; i <= radialSegments; i++) {
    const u = i / radialSegments;
    const theta = u * Math.PI * 2;
    pushVert(vertices, o, Math.cos(theta) * radiusTop, halfH, Math.sin(theta) * radiusTop, 0, 1, 0, u, 0);
    o += 8;
  }

  // Bottom cap
  const botCenterIdx = o / VERTEX_STRIDE_FLOATS;
  pushVert(vertices, o, 0, -halfH, 0, 0, -1, 0, 0.5, 0.5);
  o += 8;
  for (let i = 0; i <= radialSegments; i++) {
    const u = i / radialSegments;
    const theta = u * Math.PI * 2;
    pushVert(vertices, o, Math.cos(theta) * radiusBottom, -halfH, Math.sin(theta) * radiusBottom, 0, -1, 0, u, 1);
    o += 8;
  }

  // Indices
  const bodyTris = radialSegments * 2;
  const capTris = radialSegments * 2;
  const indices = new Uint16Array((bodyTris + capTris) * 3);
  let idx = 0;

  // Body quads (CCW winding for outward-facing normals)
  for (let i = 0; i < radialSegments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices[idx++] = a; indices[idx++] = c; indices[idx++] = b;
    indices[idx++] = b; indices[idx++] = c; indices[idx++] = d;
  }

  // Top cap fan (CCW when viewed from +Y)
  for (let i = 0; i < radialSegments; i++) {
    indices[idx++] = topCenterIdx;
    indices[idx++] = topCenterIdx + 2 + i;
    indices[idx++] = topCenterIdx + 1 + i;
  }

  // Bottom cap fan (CCW when viewed from -Y)
  for (let i = 0; i < radialSegments; i++) {
    indices[idx++] = botCenterIdx;
    indices[idx++] = botCenterIdx + 1 + i;
    indices[idx++] = botCenterIdx + 2 + i;
  }

  return { vertices, indices, bounds: computeBoundingSphere(vertices, VERTEX_STRIDE_FLOATS) };
}
