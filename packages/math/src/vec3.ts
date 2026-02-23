/** A Vec3 is a Float32Array of length 3: [x, y, z] */
export type Vec3 = Float32Array;

export function create(): Vec3 {
  return new Float32Array(3);
}

export function fromValues(x: number, y: number, z: number): Vec3 {
  const out = new Float32Array(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  out[0] = a[0]!;
  out[1] = a[1]!;
  out[2] = a[2]!;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0]! + b[0]!;
  out[1] = a[1]! + b[1]!;
  out[2] = a[2]! + b[2]!;
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0]! - b[0]!;
  out[1] = a[1]! - b[1]!;
  out[2] = a[2]! - b[2]!;
  return out;
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out[0] = a[0]! * s;
  out[1] = a[1]! * s;
  out[2] = a[2]! * s;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = a[0]!;
  const ay = a[1]!;
  const az = a[2]!;
  const bx = b[0]!;
  const by = b[1]!;
  const bz = b[2]!;
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function length(a: Vec3): number {
  return Math.sqrt(a[0]! * a[0]! + a[1]! * a[1]! + a[2]! * a[2]!);
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a[0]! - b[0]!;
  const dy = a[1]! - b[1]!;
  const dz = a[2]! - b[2]!;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function transformQuat(out: Vec3, a: Vec3, q: Float32Array): Vec3 {
  const x = a[0]!, y = a[1]!, z = a[2]!;
  const qx = q[0]!, qy = q[1]!, qz = q[2]!, qw = q[3]!;
  // uv = cross(q.xyz, v)
  let uvx = qy * z - qz * y;
  let uvy = qz * x - qx * z;
  let uvz = qx * y - qy * x;
  // uuv = cross(q.xyz, uv)
  let uuvx = qy * uvz - qz * uvy;
  let uuvy = qz * uvx - qx * uvz;
  let uuvz = qx * uvy - qy * uvx;
  const w2 = qw * 2;
  uvx *= w2; uvy *= w2; uvz *= w2;
  uuvx *= 2; uuvy *= 2; uuvz *= 2;
  out[0] = x + uvx + uuvx;
  out[1] = y + uvy + uuvy;
  out[2] = z + uvz + uuvz;
  return out;
}

export function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out[0] = a[0]! + t * (b[0]! - a[0]!);
  out[1] = a[1]! + t * (b[1]! - a[1]!);
  out[2] = a[2]! + t * (b[2]! - a[2]!);
  return out;
}

export function normalize(out: Vec3, a: Vec3): Vec3 {
  const len = length(a);
  if (len > 0) {
    const invLen = 1 / len;
    out[0] = a[0]! * invLen;
    out[1] = a[1]! * invLen;
    out[2] = a[2]! * invLen;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}
