export interface BoundingSphere {
  center: Float32Array;
  radius: number;
}

/**
 * Compute a bounding sphere from interleaved vertex data.
 * Reads position from the first 3 floats of each vertex.
 */
export function computeBoundingSphere(
  vertices: Float32Array,
  stride: number,
): BoundingSphere {
  const vertCount = Math.floor(vertices.length / stride);
  if (vertCount === 0) {
    return { center: new Float32Array(3), radius: 0 };
  }

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < vertCount; i++) {
    const o = i * stride;
    cx += vertices[o]!;
    cy += vertices[o + 1]!;
    cz += vertices[o + 2]!;
  }
  cx /= vertCount;
  cy /= vertCount;
  cz /= vertCount;

  // Find max distance from centroid
  let maxDist2 = 0;
  for (let i = 0; i < vertCount; i++) {
    const o = i * stride;
    const dx = vertices[o]! - cx;
    const dy = vertices[o + 1]! - cy;
    const dz = vertices[o + 2]! - cz;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 > maxDist2) maxDist2 = dist2;
  }

  return {
    center: new Float32Array([cx, cy, cz]),
    radius: Math.sqrt(maxDist2),
  };
}
