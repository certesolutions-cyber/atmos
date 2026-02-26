import type { GameObject } from '@atmos/core';

/** Compute the centroid of world positions for a set of objects. */
export function computeSelectionCenter(
  objects: ReadonlySet<GameObject>,
  out: Float32Array,
): void {
  out[0] = 0; out[1] = 0; out[2] = 0;
  if (objects.size === 0) return;
  for (const obj of objects) {
    const wm = obj.transform.worldMatrix;
    out[0] += wm[12]!;
    out[1] += wm[13]!;
    out[2] += wm[14]!;
  }
  const inv = 1 / objects.size;
  out[0] *= inv; out[1] *= inv; out[2] *= inv;
}
