import type { Mat4Type } from '@atmos/math';

/** A single joint in a skeleton. */
export interface Joint {
  name: string;
  /** Index into the skeleton's joints array. -1 = root (no parent). */
  parentIndex: number;
}

/** Skeleton data: joint hierarchy + inverse bind matrices + rest pose. */
export interface Skeleton {
  joints: readonly Joint[];
  /** One 4x4 matrix per joint (flattened: jointCount * 16 floats). */
  inverseBindMatrices: Float32Array;
  jointCount: number;
  /** Rest-pose local translations: jointCount * 3 floats. */
  restT: Float32Array;
  /** Rest-pose local rotations (quaternions): jointCount * 4 floats. */
  restR: Float32Array;
  /** Rest-pose local scales: jointCount * 3 floats. */
  restS: Float32Array;
}

/**
 * Create a skeleton from joint definitions and inverse bind matrices.
 * @param joints Joint hierarchy (parent indices must reference earlier joints or -1)
 * @param inverseBindMatrices Flat Float32Array of jointCount * 16 floats
 * @param restT Optional rest-pose translations (jointCount * 3). Defaults to zeros.
 * @param restR Optional rest-pose rotations (jointCount * 4). Defaults to identity quaternions.
 * @param restS Optional rest-pose scales (jointCount * 3). Defaults to (1,1,1).
 */
export function createSkeleton(
  joints: Joint[],
  inverseBindMatrices: Float32Array,
  restT?: Float32Array,
  restR?: Float32Array,
  restS?: Float32Array,
): Skeleton {
  if (inverseBindMatrices.length !== joints.length * 16) {
    throw new Error(
      `Expected ${joints.length * 16} floats for inverseBindMatrices, got ${inverseBindMatrices.length}`,
    );
  }
  const jc = joints.length;

  const defaultT = restT ?? new Float32Array(jc * 3);
  const defaultR = restR ?? (() => {
    const r = new Float32Array(jc * 4);
    for (let i = 0; i < jc; i++) r[i * 4 + 3] = 1; // identity quaternions
    return r;
  })();
  const defaultS = restS ?? (() => {
    const s = new Float32Array(jc * 3);
    for (let i = 0; i < jc; i++) { s[i * 3] = 1; s[i * 3 + 1] = 1; s[i * 3 + 2] = 1; }
    return s;
  })();

  return {
    joints,
    inverseBindMatrices,
    jointCount: jc,
    restT: defaultT,
    restR: defaultR,
    restS: defaultS,
  };
}

/** Read one inverse bind matrix from a skeleton. */
export function getInverseBindMatrix(
  out: Mat4Type,
  skeleton: Skeleton,
  jointIndex: number,
): Mat4Type {
  const offset = jointIndex * 16;
  for (let i = 0; i < 16; i++) {
    out[i] = skeleton.inverseBindMatrices[offset + i]!;
  }
  return out;
}
