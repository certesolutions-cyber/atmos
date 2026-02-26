import type { GameObject } from '@atmos/core';
import { Mat4, Quat } from '@atmos/math';

export interface ColliderOffset {
  tx: number; ty: number; tz: number;
  rx: number; ry: number; rz: number; rw: number;
  sx: number; sy: number; sz: number;
}

// Scratch arrays — reused to avoid heap allocs
const _invParent = Mat4.create();
const _relative = Mat4.create();
const _tmpQuat = Quat.create();

/**
 * Compute the offset of a child collider GO relative to its body's GO.
 * Both transforms must have up-to-date world matrices before calling.
 */
export function computeColliderOffset(
  bodyGo: GameObject,
  childGo: GameObject,
): ColliderOffset {
  // relative = inv(bodyWorld) * childWorld
  if (!Mat4.invert(_invParent, bodyGo.transform.worldMatrix)) {
    // Singular body world matrix (e.g. zero scale) — return identity offset
    return { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 };
  }
  Mat4.multiply(_relative, _invParent, childGo.transform.worldMatrix);

  // Translation from column 3
  const tx = _relative[12]!;
  const ty = _relative[13]!;
  const tz = _relative[14]!;

  // Scale from column lengths
  const sx = Math.sqrt(_relative[0]! ** 2 + _relative[1]! ** 2 + _relative[2]! ** 2);
  const sy = Math.sqrt(_relative[4]! ** 2 + _relative[5]! ** 2 + _relative[6]! ** 2);
  const sz = Math.sqrt(_relative[8]! ** 2 + _relative[9]! ** 2 + _relative[10]! ** 2);

  // Rotation (Quat.fromMat4 normalizes columns internally)
  Quat.fromMat4(_tmpQuat, _relative);

  return {
    tx, ty, tz,
    rx: _tmpQuat[0]!, ry: _tmpQuat[1]!, rz: _tmpQuat[2]!, rw: _tmpQuat[3]!,
    sx, sy, sz,
  };
}
