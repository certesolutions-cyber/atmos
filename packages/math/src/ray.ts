import type { Vec3 } from './vec3.js';
import * as V3 from './vec3.js';
import type { Mat4 } from './mat4.js';

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export function create(): Ray {
  return {
    origin: new Float32Array(3),
    direction: V3.fromValues(0, 0, -1),
  };
}

// Scratch vectors (pre-allocated, no heap alloc per call)
const _ndcNear = V3.create();
const _ndcFar = V3.create();
const _clipNear = new Float32Array(4);
const _clipFar = new Float32Array(4);

function transformMat4Vec4(out: Float32Array, v: Float32Array, m: Mat4): void {
  const x = v[0]!, y = v[1]!, z = v[2]!, w = v[3]!;
  out[0] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w;
  out[1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w;
  out[2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w;
  out[3] = m[3]! * x + m[7]! * y + m[11]! * z + m[15]! * w;
}

/**
 * Build a ray from screen pixel coordinates using an inverse view-projection matrix.
 * sx, sy are in pixels; vpW, vpH are viewport dimensions.
 */
export function fromScreenCoords(
  out: Ray,
  sx: number,
  sy: number,
  vpW: number,
  vpH: number,
  invVP: Mat4,
): Ray {
  // Pixel -> NDC [-1,1]
  const ndcX = (sx / vpW) * 2 - 1;
  const ndcY = 1 - (sy / vpH) * 2; // flip Y

  // Near point in clip space (z = -1 for WebGPU NDC is 0, but we use -1..1 convention with invVP)
  _clipNear[0] = ndcX;
  _clipNear[1] = ndcY;
  _clipNear[2] = 0; // WebGPU near plane = 0
  _clipNear[3] = 1;

  // Far point in clip space
  _clipFar[0] = ndcX;
  _clipFar[1] = ndcY;
  _clipFar[2] = 1; // WebGPU far plane = 1
  _clipFar[3] = 1;

  // Unproject
  transformMat4Vec4(_clipNear, _clipNear, invVP);
  transformMat4Vec4(_clipFar, _clipFar, invVP);

  // Perspective divide
  const wNear = _clipNear[3]!;
  V3.set(_ndcNear, _clipNear[0]! / wNear, _clipNear[1]! / wNear, _clipNear[2]! / wNear);

  const wFar = _clipFar[3]!;
  V3.set(_ndcFar, _clipFar[0]! / wFar, _clipFar[1]! / wFar, _clipFar[2]! / wFar);

  // Origin = near point, direction = normalize(far - near)
  V3.copy(out.origin, _ndcNear);
  V3.sub(out.direction, _ndcFar, _ndcNear);
  V3.normalize(out.direction, out.direction);

  return out;
}

/**
 * Ray-sphere intersection. Returns t >= 0 if hit, -1 if miss.
 */
export function intersectSphere(
  ray: Ray,
  center: Vec3,
  radius: number,
): number {
  const ocX = ray.origin[0]! - center[0]!;
  const ocY = ray.origin[1]! - center[1]!;
  const ocZ = ray.origin[2]! - center[2]!;

  const dX = ray.direction[0]!;
  const dY = ray.direction[1]!;
  const dZ = ray.direction[2]!;

  const a = dX * dX + dY * dY + dZ * dZ;
  const b = 2 * (ocX * dX + ocY * dY + ocZ * dZ);
  const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return -1;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  if (t1 >= 0) return t1;

  const t2 = (-b + sqrtD) / (2 * a);
  if (t2 >= 0) return t2;

  return -1;
}

/**
 * Ray-plane intersection. Plane defined as dot(normal, P) = d.
 * Returns t >= 0 if hit, -1 if parallel or behind.
 */
export function intersectPlane(
  ray: Ray,
  normal: Vec3,
  d: number,
): number {
  const denom = V3.dot(ray.direction, normal);
  if (Math.abs(denom) < 1e-8) return -1; // parallel

  const t = (d - V3.dot(ray.origin, normal)) / denom;
  return t >= 0 ? t : -1;
}

/**
 * Ray-triangle intersection using Möller–Trumbore algorithm.
 * Returns t >= 0 if hit, -1 if miss.
 */
export function intersectTriangle(
  ray: Ray,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
): number {
  const e1x = v1[0]! - v0[0]!, e1y = v1[1]! - v0[1]!, e1z = v1[2]! - v0[2]!;
  const e2x = v2[0]! - v0[0]!, e2y = v2[1]! - v0[1]!, e2z = v2[2]! - v0[2]!;

  const dx = ray.direction[0]!, dy = ray.direction[1]!, dz = ray.direction[2]!;

  // h = d × e2
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;

  const a = e1x * hx + e1y * hy + e1z * hz;
  if (a > -1e-8 && a < 1e-8) return -1; // parallel

  const f = 1 / a;
  const sx = ray.origin[0]! - v0[0]!;
  const sy = ray.origin[1]! - v0[1]!;
  const sz = ray.origin[2]! - v0[2]!;

  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return -1;

  // q = s × e1
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;

  const v = f * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return -1;

  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t >= 0 ? t : -1;
}

/**
 * Compute point on ray at parameter t: out = origin + t * direction.
 */
export function pointOnRay(out: Vec3, ray: Ray, t: number): Vec3 {
  out[0] = ray.origin[0]! + t * ray.direction[0]!;
  out[1] = ray.origin[1]! + t * ray.direction[1]!;
  out[2] = ray.origin[2]! + t * ray.direction[2]!;
  return out;
}
