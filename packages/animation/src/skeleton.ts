import type { Mat4Type } from '@atmos/math';

/** A single joint in a skeleton. */
export interface Joint {
  name: string;
  /** Index into the skeleton's joints array. -1 = root (no parent). */
  parentIndex: number;
}

/** Skeleton data: joint hierarchy + inverse bind matrices. */
export interface Skeleton {
  joints: readonly Joint[];
  /** One 4x4 matrix per joint (flattened: jointCount * 16 floats). */
  inverseBindMatrices: Float32Array;
  jointCount: number;
}

/**
 * Create a skeleton from joint definitions and inverse bind matrices.
 * @param joints Joint hierarchy (parent indices must reference earlier joints or -1)
 * @param inverseBindMatrices Flat Float32Array of jointCount * 16 floats
 */
export function createSkeleton(
  joints: Joint[],
  inverseBindMatrices: Float32Array,
): Skeleton {
  if (inverseBindMatrices.length !== joints.length * 16) {
    throw new Error(
      `Expected ${joints.length * 16} floats for inverseBindMatrices, got ${inverseBindMatrices.length}`,
    );
  }
  return {
    joints,
    inverseBindMatrices,
    jointCount: joints.length,
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
