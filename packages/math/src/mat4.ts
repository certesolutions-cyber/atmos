import type { Vec3 } from './vec3.js';
import type { Quat } from './quat.js';

/** A Mat4 is a Float32Array of length 16 in column-major order */
export type Mat4 = Float32Array;

export function create(): Mat4 {
  return new Float32Array(16);
}

export function identity(out: Mat4): Mat4 {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;

  let b0 = b[0]!, b1 = b[1]!, b2 = b[2]!, b3 = b[3]!;
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]!; b1 = b[5]!; b2 = b[6]!; b3 = b[7]!;
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]!; b1 = b[9]!; b2 = b[10]!; b3 = b[11]!;
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]!; b1 = b[13]!; b2 = b[14]!; b3 = b[15]!;
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
}

export function translate(out: Mat4, a: Mat4, v: Vec3): Mat4 {
  const x = v[0]!, y = v[1]!, z = v[2]!;
  if (a === out) {
    out[12] = a[0]! * x + a[4]! * y + a[8]! * z + a[12]!;
    out[13] = a[1]! * x + a[5]! * y + a[9]! * z + a[13]!;
    out[14] = a[2]! * x + a[6]! * y + a[10]! * z + a[14]!;
    out[15] = a[3]! * x + a[7]! * y + a[11]! * z + a[15]!;
  } else {
    const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
    const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
    const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
    out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
    out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
    out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;
    out[12] = a00 * x + a10 * y + a20 * z + a[12]!;
    out[13] = a01 * x + a11 * y + a21 * z + a[13]!;
    out[14] = a02 * x + a12 * y + a22 * z + a[14]!;
    out[15] = a03 * x + a13 * y + a23 * z + a[15]!;
  }
  return out;
}

export function scale(out: Mat4, a: Mat4, v: Vec3): Mat4 {
  const x = v[0]!, y = v[1]!, z = v[2]!;
  out[0] = a[0]! * x; out[1] = a[1]! * x; out[2] = a[2]! * x; out[3] = a[3]! * x;
  out[4] = a[4]! * y; out[5] = a[5]! * y; out[6] = a[6]! * y; out[7] = a[7]! * y;
  out[8] = a[8]! * z; out[9] = a[9]! * z; out[10] = a[10]! * z; out[11] = a[11]! * z;
  out[12] = a[12]!; out[13] = a[13]!; out[14] = a[14]!; out[15] = a[15]!;
  return out;
}

export function rotateX(out: Mat4, a: Mat4, rad: number): Mat4 {
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;

  if (a !== out) {
    out[0] = a[0]!; out[1] = a[1]!; out[2] = a[2]!; out[3] = a[3]!;
    out[12] = a[12]!; out[13] = a[13]!; out[14] = a[14]!; out[15] = a[15]!;
  }

  out[4] = a10 * c + a20 * s;
  out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s;
  out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s;
  out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s;
  out[11] = a23 * c - a13 * s;
  return out;
}

export function rotateY(out: Mat4, a: Mat4, rad: number): Mat4 {
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;

  if (a !== out) {
    out[4] = a[4]!; out[5] = a[5]!; out[6] = a[6]!; out[7] = a[7]!;
    out[12] = a[12]!; out[13] = a[13]!; out[14] = a[14]!; out[15] = a[15]!;
  }

  out[0] = a00 * c - a20 * s;
  out[1] = a01 * c - a21 * s;
  out[2] = a02 * c - a22 * s;
  out[3] = a03 * c - a23 * s;
  out[8] = a00 * s + a20 * c;
  out[9] = a01 * s + a21 * c;
  out[10] = a02 * s + a22 * c;
  out[11] = a03 * s + a23 * c;
  return out;
}

export function rotateZ(out: Mat4, a: Mat4, rad: number): Mat4 {
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;

  if (a !== out) {
    out[8] = a[8]!; out[9] = a[9]!; out[10] = a[10]!; out[11] = a[11]!;
    out[12] = a[12]!; out[13] = a[13]!; out[14] = a[14]!; out[15] = a[15]!;
  }

  out[0] = a00 * c + a10 * s;
  out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s;
  out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s;
  out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s;
  out[7] = a13 * c - a03 * s;
  return out;
}

/** Orthographic projection (WebGPU NDC: depth 0..1) */
export function ortho(
  out: Mat4,
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  out[0] = -2 * lr; out[1] = 0;       out[2] = 0;    out[3] = 0;
  out[4] = 0;       out[5] = -2 * bt; out[6] = 0;    out[7] = 0;
  out[8] = 0;       out[9] = 0;       out[10] = nf;  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = near * nf;
  out[15] = 1;
  return out;
}

export function perspective(
  out: Mat4,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1.0 / Math.tan(fovY / 2);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;

  if (far !== Infinity) {
    const rangeInv = 1 / (near - far);
    out[10] = far * rangeInv;
    out[14] = far * near * rangeInv;
  } else {
    out[10] = -1;
    out[14] = -near;
  }
  return out;
}

export function lookAt(out: Mat4, eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const eyeX = eye[0]!, eyeY = eye[1]!, eyeZ = eye[2]!;
  const centerX = center[0]!, centerY = center[1]!, centerZ = center[2]!;
  const upX = up[0]!, upY = up[1]!, upZ = up[2]!;

  let fX = centerX - eyeX;
  let fY = centerY - eyeY;
  let fZ = centerZ - eyeZ;
  let len = Math.sqrt(fX * fX + fY * fY + fZ * fZ);
  if (len < 1e-8) return identity(out);
  len = 1 / len;
  fX *= len; fY *= len; fZ *= len;

  let sX = fY * upZ - fZ * upY;
  let sY = fZ * upX - fX * upZ;
  let sZ = fX * upY - fY * upX;
  len = Math.sqrt(sX * sX + sY * sY + sZ * sZ);
  if (len < 1e-8) return identity(out);
  len = 1 / len;
  sX *= len; sY *= len; sZ *= len;

  const uX = sY * fZ - sZ * fY;
  const uY = sZ * fX - sX * fZ;
  const uZ = sX * fY - sY * fX;

  out[0] = sX; out[1] = uX; out[2] = -fX; out[3] = 0;
  out[4] = sY; out[5] = uY; out[6] = -fY; out[7] = 0;
  out[8] = sZ; out[9] = uZ; out[10] = -fZ; out[11] = 0;
  out[12] = -(sX * eyeX + sY * eyeY + sZ * eyeZ);
  out[13] = -(uX * eyeX + uY * eyeY + uZ * eyeZ);
  out[14] = fX * eyeX + fY * eyeY + fZ * eyeZ;
  out[15] = 1;
  return out;
}

export function invert(out: Mat4, a: Mat4): Mat4 | null {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export function transpose(out: Mat4, a: Mat4): Mat4 {
  if (out === a) {
    const a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
    const a12 = a[6]!, a13 = a[7]!;
    const a23 = a[11]!;
    out[1] = a[4]!; out[2] = a[8]!; out[3] = a[12]!;
    out[4] = a01;   out[6] = a[9]!; out[7] = a[13]!;
    out[8] = a02;   out[9] = a12;   out[11] = a[14]!;
    out[12] = a03;  out[13] = a13;  out[14] = a23;
  } else {
    out[0] = a[0]!;  out[1] = a[4]!;  out[2] = a[8]!;   out[3] = a[12]!;
    out[4] = a[1]!;  out[5] = a[5]!;  out[6] = a[9]!;   out[7] = a[13]!;
    out[8] = a[2]!;  out[9] = a[6]!;  out[10] = a[10]!; out[11] = a[14]!;
    out[12] = a[3]!; out[13] = a[7]!; out[14] = a[11]!; out[15] = a[15]!;
  }
  return out;
}

export function fromRotationTranslationScale(
  out: Mat4,
  q: Quat,
  v: Vec3,
  s: Vec3,
): Mat4 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0]!, sy = s[1]!, sz = s[2]!;

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0]!;
  out[13] = v[1]!;
  out[14] = v[2]!;
  out[15] = 1;
  return out;
}
