/**
 * Bone matrix computation: compose local TRS → walk parent chain → apply inverse bind matrix.
 * Pre-allocated scratch arrays at module level for zero heap allocs on hot path.
 */

import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
import type { Skeleton } from './skeleton.js';

// Module-level scratch matrices (reused every frame)
const _localMat: Mat4Type = Mat4.create();
const _ibm: Mat4Type = Mat4.create();

/**
 * Compute final bone matrices (joint matrix = parentWorldMatrix * localTRS * inverseBindMatrix).
 *
 * @param out      Output buffer: jointCount * 16 floats. Each 16-float block is one mat4.
 * @param skeleton The skeleton hierarchy
 * @param localT   Per-joint local translations: jointCount * 3 floats
 * @param localR   Per-joint local rotations (quaternions): jointCount * 4 floats
 * @param localS   Per-joint local scales: jointCount * 3 floats
 */
export function computeBoneMatrices(
  out: Float32Array,
  skeleton: Skeleton,
  localT: Float32Array,
  localR: Float32Array,
  localS: Float32Array,
): void {
  const { joints, jointCount, inverseBindMatrices } = skeleton;

  // Pass 1: Compute world matrices in-place in `out`.
  // We rely on parent indices always being < current index (topological order).
  for (let i = 0; i < jointCount; i++) {
    const tOff = i * 3;
    const rOff = i * 4;
    const sOff = i * 3;
    const outOff = i * 16;

    // Compose local TRS matrix
    Mat4.fromRotationTranslationScale(
      _localMat,
      localR.subarray(rOff, rOff + 4),
      localT.subarray(tOff, tOff + 3),
      localS.subarray(sOff, sOff + 3),
    );

    const parentIdx = joints[i]!.parentIndex;
    if (parentIdx < 0) {
      // Root joint: world = local
      copyMat4ToBuffer(out, outOff, _localMat);
    } else {
      // world = parentWorld * local
      // Parent is already computed (topological order guarantee)
      multiplyFromBuffer(out, outOff, out, parentIdx * 16, _localMat);
    }
  }

  // Pass 2: Multiply each world matrix by its inverse bind matrix.
  // finalBoneMatrix = worldMatrix * inverseBindMatrix
  for (let i = 0; i < jointCount; i++) {
    const outOff = i * 16;
    const ibmOff = i * 16;

    // Read IBM
    for (let j = 0; j < 16; j++) {
      _ibm[j] = inverseBindMatrices[ibmOff + j]!;
    }

    // Read world matrix into _localMat (reuse scratch)
    for (let j = 0; j < 16; j++) {
      _localMat[j] = out[outOff + j]!;
    }

    // result = worldMatrix * IBM
    // Write directly back into out
    mulMat4InPlace(out, outOff, _localMat, _ibm);
  }
}

/** Copy a Mat4 into a Float32Array at the given offset. */
function copyMat4ToBuffer(buf: Float32Array, offset: number, m: Mat4Type): void {
  for (let i = 0; i < 16; i++) {
    buf[offset + i] = m[i]!;
  }
}

/** Multiply two mat4s where `a` is read from a buffer at aOffset, result written to buf[outOffset]. */
function multiplyFromBuffer(
  buf: Float32Array, outOffset: number,
  aBuf: Float32Array, aOffset: number,
  b: Mat4Type,
): void {
  // a * b, column-major
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += aBuf[aOffset + k * 4 + row]! * b[col * 4 + k]!;
      }
      buf[outOffset + col * 4 + row] = sum;
    }
  }
}

/** Multiply a * b and write result into buf at offset. */
function mulMat4InPlace(
  buf: Float32Array, offset: number,
  a: Mat4Type, b: Mat4Type,
): void {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row]! * b[col * 4 + k]!;
      }
      buf[offset + col * 4 + row] = sum;
    }
  }
}
