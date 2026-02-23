/**
 * View-frustum culling via 6 planes extracted from a view-projection matrix.
 *
 * Griham–Hartmann method: each frustum plane is a linear combination of
 * VP matrix rows. Planes point inward (positive half-space = inside frustum).
 */

import type { Mat4Type } from '@atmos/math';
import type { BoundingSphere } from './bounds.js';

/** 6 planes × 4 coefficients (a, b, c, d) where ax+by+cz+d >= 0 is inside. */
export type FrustumPlanes = Float32Array;

/** Extracts 6 frustum planes from a column-major VP matrix. */
export function extractFrustumPlanes(out: FrustumPlanes, vp: Mat4Type): FrustumPlanes {
  // Row vectors of the VP matrix (column-major → row i = vp[i], vp[i+4], vp[i+8], vp[i+12])
  const r0x = vp[0]!, r0y = vp[4]!, r0z = vp[8]!, r0w = vp[12]!;
  const r1x = vp[1]!, r1y = vp[5]!, r1z = vp[9]!, r1w = vp[13]!;
  const r2x = vp[2]!, r2y = vp[6]!, r2z = vp[10]!, r2w = vp[14]!;
  const r3x = vp[3]!, r3y = vp[7]!, r3z = vp[11]!, r3w = vp[15]!;

  // Left:   row3 + row0
  setPlane(out, 0, r3x + r0x, r3y + r0y, r3z + r0z, r3w + r0w);
  // Right:  row3 - row0
  setPlane(out, 1, r3x - r0x, r3y - r0y, r3z - r0z, r3w - r0w);
  // Bottom: row3 + row1
  setPlane(out, 2, r3x + r1x, r3y + r1y, r3z + r1z, r3w + r1w);
  // Top:    row3 - row1
  setPlane(out, 3, r3x - r1x, r3y - r1y, r3z - r1z, r3w - r1w);
  // Near:   row3 + row2 (WebGPU: depth [0,1] → near = row2, not row3+row2... actually row2 for [0,1])
  setPlane(out, 4, r2x, r2y, r2z, r2w);
  // Far:    row3 - row2
  setPlane(out, 5, r3x - r2x, r3y - r2y, r3z - r2z, r3w - r2w);

  return out;
}

function setPlane(out: Float32Array, idx: number, a: number, b: number, c: number, d: number): void {
  const len = Math.sqrt(a * a + b * b + c * c);
  const inv = 1 / len;
  const o = idx * 4;
  out[o] = a * inv;
  out[o + 1] = b * inv;
  out[o + 2] = c * inv;
  out[o + 3] = d * inv;
}

/** Returns true if the sphere is at least partially inside the frustum. */
export function isSphereInFrustum(planes: FrustumPlanes, sphere: BoundingSphere): boolean {
  const cx = sphere.center[0]!;
  const cy = sphere.center[1]!;
  const cz = sphere.center[2]!;
  const r = sphere.radius;

  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    const dist = planes[o]! * cx + planes[o + 1]! * cy + planes[o + 2]! * cz + planes[o + 3]!;
    if (dist < -r) return false;
  }
  return true;
}
