import type { DensityFn } from './types.js';

const STRIDE = 8;

/**
 * Compute smooth normals via central-difference gradient of the density field.
 * Overwrites the normal slots (offsets 3,4,5) in the vertex buffer.
 */
export function computeGradientNormals(
  vertices: Float32Array,
  vertexCount: number,
  densityFn: DensityFn,
  epsilon: number,
): void {
  for (let i = 0; i < vertexCount; i++) {
    const o = i * STRIDE;
    const px = vertices[o]!;
    const py = vertices[o + 1]!;
    const pz = vertices[o + 2]!;

    // Central differences: gradient of density (positive = air)
    // Normal points from solid toward air (in direction of increasing density)
    let nx = densityFn(px + epsilon, py, pz) - densityFn(px - epsilon, py, pz);
    let ny = densityFn(px, py + epsilon, pz) - densityFn(px, py - epsilon, pz);
    let nz = densityFn(px, py, pz + epsilon) - densityFn(px, py, pz - epsilon);

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-10) {
      const inv = 1 / len;
      nx *= inv;
      ny *= inv;
      nz *= inv;
    } else {
      nx = 0; ny = 1; nz = 0;
    }

    vertices[o + 3] = nx;
    vertices[o + 4] = ny;
    vertices[o + 5] = nz;
  }
}

/**
 * Compute face-weighted normals from triangle data.
 * Each vertex normal is the normalized sum of the face normals of all
 * triangles sharing that vertex, weighted by triangle area.
 */
export function computeTriangleNormals(
  vertices: Float32Array,
  indices: Uint32Array,
  vertexCount: number,
  indexCount: number,
): void {
  // Zero out normals
  for (let i = 0; i < vertexCount; i++) {
    const o = i * STRIDE;
    vertices[o + 3] = 0;
    vertices[o + 4] = 0;
    vertices[o + 5] = 0;
  }

  // Accumulate face normals (area-weighted via cross product magnitude)
  for (let t = 0; t < indexCount; t += 3) {
    const i0 = indices[t]!;
    const i1 = indices[t + 1]!;
    const i2 = indices[t + 2]!;

    const o0 = i0 * STRIDE;
    const o1 = i1 * STRIDE;
    const o2 = i2 * STRIDE;

    const ax = vertices[o1]! - vertices[o0]!;
    const ay = vertices[o1 + 1]! - vertices[o0 + 1]!;
    const az = vertices[o1 + 2]! - vertices[o0 + 2]!;
    const bx = vertices[o2]! - vertices[o0]!;
    const by = vertices[o2 + 1]! - vertices[o0 + 1]!;
    const bz = vertices[o2 + 2]! - vertices[o0 + 2]!;

    // Cross product (area-weighted normal)
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    vertices[o0 + 3] = vertices[o0 + 3]! + nx; vertices[o0 + 4] = vertices[o0 + 4]! + ny; vertices[o0 + 5] = vertices[o0 + 5]! + nz;
    vertices[o1 + 3] = vertices[o1 + 3]! + nx; vertices[o1 + 4] = vertices[o1 + 4]! + ny; vertices[o1 + 5] = vertices[o1 + 5]! + nz;
    vertices[o2 + 3] = vertices[o2 + 3]! + nx; vertices[o2 + 4] = vertices[o2 + 4]! + ny; vertices[o2 + 5] = vertices[o2 + 5]! + nz;
  }

  // Normalize
  for (let i = 0; i < vertexCount; i++) {
    const o = i * STRIDE;
    let nx = vertices[o + 3]!;
    let ny = vertices[o + 4]!;
    let nz = vertices[o + 5]!;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-10) {
      const inv = 1 / len;
      vertices[o + 3] = nx * inv;
      vertices[o + 4] = ny * inv;
      vertices[o + 5] = nz * inv;
    } else {
      vertices[o + 3] = 0;
      vertices[o + 4] = 1;
      vertices[o + 5] = 0;
    }
  }
}
