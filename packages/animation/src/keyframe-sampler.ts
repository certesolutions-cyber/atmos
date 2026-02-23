/**
 * Keyframe sampling with binary search + interpolation.
 * Hot-path code – zero heap allocations via module-level scratch arrays.
 */

import { Vec3, Quat } from '@atmos/math';
import type { KeyframeTrack } from './animation-clip.js';

// Scratch arrays for interpolation (never exposed)
const _scratchA = new Float32Array(4);
const _scratchB = new Float32Array(4);

/**
 * Sample a keyframe track at the given time, writing the result into `out`.
 * For translation/scale: out must be Float32Array(3).
 * For rotation: out must be Float32Array(4).
 *
 * @returns The `out` array.
 */
export function sampleTrack(
  out: Float32Array,
  track: KeyframeTrack,
  time: number,
): Float32Array {
  const { times, values, interpolation, channel } = track;
  const keyCount = times.length;

  if (keyCount === 0) return out;

  // Clamp to range
  if (time <= times[0]!) {
    return copyValues(out, values, 0, channel);
  }
  if (time >= times[keyCount - 1]!) {
    return copyValues(out, values, keyCount - 1, channel);
  }

  // Binary search for the keyframe pair
  const i = findKeyframe(times, time);
  const t0 = times[i]!;
  const t1 = times[i + 1]!;

  if (interpolation === 'STEP') {
    return copyValues(out, values, i, channel);
  }

  // LINEAR interpolation
  const alpha = (time - t0) / (t1 - t0);
  const stride = channel === 'rotation' ? 4 : 3;
  const off0 = i * stride;
  const off1 = (i + 1) * stride;

  if (channel === 'rotation') {
    // Quaternion slerp
    for (let j = 0; j < 4; j++) {
      _scratchA[j] = values[off0 + j]!;
      _scratchB[j] = values[off1 + j]!;
    }
    Quat.slerp(out, _scratchA, _scratchB, alpha);
  } else {
    // Vec3 lerp for translation / scale
    for (let j = 0; j < 3; j++) {
      _scratchA[j] = values[off0 + j]!;
      _scratchB[j] = values[off1 + j]!;
    }
    Vec3.lerp(out, _scratchA.subarray(0, 3), _scratchB.subarray(0, 3), alpha);
  }

  return out;
}

/** Copy values for the given keyframe index into `out`. */
function copyValues(
  out: Float32Array,
  values: Float32Array,
  index: number,
  channel: string,
): Float32Array {
  const stride = channel === 'rotation' ? 4 : 3;
  const offset = index * stride;
  for (let i = 0; i < stride; i++) {
    out[i] = values[offset + i]!;
  }
  return out;
}

/**
 * Binary search: find index i such that times[i] <= time < times[i+1].
 * Assumes time is within [times[0], times[last]].
 */
function findKeyframe(times: Float32Array, time: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}
