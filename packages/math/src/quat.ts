import type { Vec3 } from './vec3.js';
import type { Mat4 } from './mat4.js';

/** A Quat is a Float32Array of length 4: [x, y, z, w] */
export type Quat = Float32Array;

export function create(): Quat {
  const out = new Float32Array(4);
  out[3] = 1;
  return out;
}

export function identity(out: Quat): Quat {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}

export function fromAxisAngle(out: Quat, axis: Vec3, rad: number): Quat {
  const half = rad * 0.5;
  const s = Math.sin(half);
  out[0] = axis[0]! * s;
  out[1] = axis[1]! * s;
  out[2] = axis[2]! * s;
  out[3] = Math.cos(half);
  return out;
}

export function fromEuler(out: Quat, x: number, y: number, z: number): Quat {
  const halfX = x * 0.5;
  const halfY = y * 0.5;
  const halfZ = z * 0.5;
  const sx = Math.sin(halfX), cx = Math.cos(halfX);
  const sy = Math.sin(halfY), cy = Math.cos(halfY);
  const sz = Math.sin(halfZ), cz = Math.cos(halfZ);

  out[0] = sx * cy * cz - cx * sy * sz;
  out[1] = cx * sy * cz + sx * cy * sz;
  out[2] = cx * cy * sz - sx * sy * cz;
  out[3] = cx * cy * cz + sx * sy * sz;
  return out;
}

export function multiply(out: Quat, a: Quat, b: Quat): Quat {
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  const bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;
  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function normalize(out: Quat, a: Quat): Quat {
  const x = a[0]!, y = a[1]!, z = a[2]!, w = a[3]!;
  let len = x * x + y * y + z * z + w * w;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
    out[0] = x * len;
    out[1] = y * len;
    out[2] = z * len;
    out[3] = w * len;
  }
  return out;
}

export function slerp(out: Quat, a: Quat, b: Quat, t: number): Quat {
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  let bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;

  let cosom = ax * bx + ay * by + az * bz + aw * bw;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  // Clamp to [0, 1] to avoid NaN from floating-point overshoot in Math.acos
  if (cosom > 1) cosom = 1;

  let scale0: number;
  let scale1: number;
  if (1.0 - cosom > 1e-6) {
    const omega = Math.acos(cosom);
    const sinom = Math.sin(omega);
    if (sinom > 1e-6) {
      scale0 = Math.sin((1.0 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    } else {
      scale0 = 1.0 - t;
      scale1 = t;
    }
  } else {
    scale0 = 1.0 - t;
    scale1 = t;
  }

  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;
  return out;
}

/**
 * Extract Euler angles (XYZ order) from a quaternion.
 * Returns [x, y, z] in radians.
 */
export function toEuler(out: Vec3, q: Quat): Vec3 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;

  // Roll (x-axis)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  out[0] = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis) — clamp to avoid NaN from asin
  const sinp = 2 * (w * y - z * x);
  out[1] = Math.abs(sinp) >= 1
    ? Math.sign(sinp) * (Math.PI / 2)
    : Math.asin(sinp);

  // Yaw (z-axis)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  out[2] = Math.atan2(siny_cosp, cosy_cosp);

  return out;
}

export function invert(out: Quat, a: Quat): Quat {
  const x = a[0]!, y = a[1]!, z = a[2]!, w = a[3]!;
  const dot = x * x + y * y + z * z + w * w;
  const invDot = dot > 0 ? 1.0 / dot : 0;
  out[0] = -x * invDot;
  out[1] = -y * invDot;
  out[2] = -z * invDot;
  out[3] = w * invDot;
  return out;
}

export function copy(out: Quat, a: Quat): Quat {
  out[0] = a[0]!;
  out[1] = a[1]!;
  out[2] = a[2]!;
  out[3] = a[3]!;
  return out;
}

/**
 * Extract rotation quaternion from a Mat4.
 * Handles non-uniform scale by normalizing column vectors.
 */
export function fromMat4(out: Quat, m: Mat4): Quat {
  // Column scale lengths
  const sx = Math.sqrt(m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!);
  const sy = Math.sqrt(m[4]! * m[4]! + m[5]! * m[5]! + m[6]! * m[6]!);
  const sz = Math.sqrt(m[8]! * m[8]! + m[9]! * m[9]! + m[10]! * m[10]!);

  const isx = sx > 1e-8 ? 1 / sx : 0;
  const isy = sy > 1e-8 ? 1 / sy : 0;
  const isz = sz > 1e-8 ? 1 / sz : 0;

  // Normalized rotation matrix elements
  const m00 = m[0]! * isx, m01 = m[1]! * isx, m02 = m[2]! * isx;
  const m10 = m[4]! * isy, m11 = m[5]! * isy, m12 = m[6]! * isy;
  const m20 = m[8]! * isz, m21 = m[9]! * isz, m22 = m[10]! * isz;

  // Shepperd's method
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out[3] = 0.25 / s;
    out[0] = (m12 - m21) * s;
    out[1] = (m20 - m02) * s;
    out[2] = (m01 - m10) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    out[3] = (m12 - m21) / s;
    out[0] = 0.25 * s;
    out[1] = (m01 + m10) / s;
    out[2] = (m20 + m02) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    out[3] = (m20 - m02) / s;
    out[0] = (m01 + m10) / s;
    out[1] = 0.25 * s;
    out[2] = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    out[3] = (m01 - m10) / s;
    out[0] = (m20 + m02) / s;
    out[1] = (m12 + m21) / s;
    out[2] = 0.25 * s;
  }

  return out;
}

/**
 * Rotate a quaternion around the X axis by the given angle (radians).
 * Equivalent to multiply(out, fromAxisAngle([1,0,0], rad), a) but without temp allocation.
 */
export function rotateX(out: Quat, a: Quat, rad: number): Quat {
  const half = rad * 0.5;
  const bx = Math.sin(half);
  const bw = Math.cos(half);
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  out[0] = bx * aw + bw * ax;
  out[1] = bw * ay - bx * az;
  out[2] = bw * az + bx * ay;
  out[3] = bw * aw - bx * ax;
  return out;
}

/**
 * Rotate a quaternion around the Y axis by the given angle (radians).
 * Equivalent to multiply(out, fromAxisAngle([0,1,0], rad), a) but without temp allocation.
 */
export function rotateY(out: Quat, a: Quat, rad: number): Quat {
  const half = rad * 0.5;
  const by = Math.sin(half);
  const bw = Math.cos(half);
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  out[0] = bw * ax + by * az;
  out[1] = by * aw + bw * ay;
  out[2] = bw * az - by * ax;
  out[3] = bw * aw - by * ay;
  return out;
}

/**
 * Rotate a quaternion around the Z axis by the given angle (radians).
 * Equivalent to multiply(out, fromAxisAngle([0,0,1], rad), a) but without temp allocation.
 */
export function rotateZ(out: Quat, a: Quat, rad: number): Quat {
  const half = rad * 0.5;
  const bz = Math.sin(half);
  const bw = Math.cos(half);
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  out[0] = bw * ax - bz * ay;
  out[1] = bw * ay + bz * ax;
  out[2] = bz * aw + bw * az;
  out[3] = bw * aw - bz * az;
  return out;
}

export function toMat4(out: Mat4, q: Quat): Mat4 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = 0;
  out[4] = xy - wz;
  out[5] = 1 - (xx + zz);
  out[6] = yz + wx;
  out[7] = 0;
  out[8] = xz + wy;
  out[9] = yz - wx;
  out[10] = 1 - (xx + yy);
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
