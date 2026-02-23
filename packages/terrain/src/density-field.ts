import type { DensityFn, DensityWithWeightsFn } from './types.js';

/** Adapt a simple DensityFn to DensityWithWeightsFn (no weights). */
export function adaptDensityFn(fn: DensityFn): DensityWithWeightsFn {
  return (x, y, z) => ({ density: fn(x, y, z) });
}

// --- Primitives ---
// Convention: positive = air, negative = solid, surface at 0

/**
 * Signed distance field for a sphere.
 * Negative inside, positive outside (solid inside).
 * Returns a DensityFn where negative = solid.
 */
export function sphereDensity(
  cx: number, cy: number, cz: number,
  radius: number,
): DensityFn {
  return (x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - radius;
  };
}

/**
 * Half-space density: solid below the plane at y = height.
 * Returns negative (solid) when y < height, positive (air) when y > height.
 */
export function planeDensity(height: number): DensityFn {
  return (_x, y, _z) => y - height;
}

/**
 * Axis-aligned box density. Solid inside the box.
 * @param cx,cy,cz Center of the box
 * @param hx,hy,hz Half-extents
 */
export function boxDensity(
  cx: number, cy: number, cz: number,
  hx: number, hy: number, hz: number,
): DensityFn {
  return (x, y, z) => {
    const dx = Math.abs(x - cx) - hx;
    const dy = Math.abs(y - cy) - hy;
    const dz = Math.abs(z - cz) - hz;
    // Exact SDF for an AABB
    const outsideDist = Math.sqrt(
      Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2 + Math.max(dz, 0) ** 2,
    );
    const insideDist = Math.min(Math.max(dx, dy, dz), 0);
    return outsideDist + insideDist;
  };
}

// --- CSG Combinators ---

/** Union: solid where either A or B is solid (min of two SDFs). */
export function unionDensity(a: DensityFn, b: DensityFn): DensityFn {
  return (x, y, z) => Math.min(a(x, y, z), b(x, y, z));
}

/** Intersection: solid where both A and B are solid (max of two SDFs). */
export function intersectDensity(a: DensityFn, b: DensityFn): DensityFn {
  return (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
}

/** Subtraction: solid where A is solid but B is not (A minus B). */
export function subtractDensity(a: DensityFn, b: DensityFn): DensityFn {
  return (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
}

/**
 * Noise-based terrain: creates a heightmap-style density using an external noise function.
 * @param noiseFn 2D noise function (x, z) => value in [-1, 1]
 * @param amplitude Height amplitude of the noise
 * @param baseHeight Base terrain height (y)
 */
export function noiseTerrain(
  noiseFn: (x: number, z: number) => number,
  amplitude: number,
  baseHeight: number,
): DensityFn {
  return (x, y, z) => {
    const terrainHeight = baseHeight + noiseFn(x, z) * amplitude;
    return y - terrainHeight;
  };
}

