import type { DensityFn, DensityWithWeightsFn, HeightFn, HeightmapData } from './types.js';

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

/**
 * Height-function terrain: converts a 2D height function to a density field.
 * Solid below the height, air above.
 */
export function heightFnTerrain(fn: HeightFn): DensityFn {
  return (x, y, z) => y - fn(x, z);
}

/**
 * Heightmap terrain: converts a 2D heightmap array to a density field.
 * Uses bilinear interpolation and clamps at edges (infinite extension).
 */
export function heightmapTerrain(data: HeightmapData): DensityFn {
  const { heights, width, depth, scaleX, scaleZ, scaleY } = data;
  const ox = data.offsetX ?? 0;
  const oz = data.offsetZ ?? 0;
  const maxX = width - 1;
  const maxZ = depth - 1;

  return (x, y, z) => {
    const gx = (x - ox) / scaleX;
    const gz = (z - oz) / scaleZ;

    const cx = Math.max(0, Math.min(maxX, gx));
    const cz = Math.max(0, Math.min(maxZ, gz));

    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const x1 = Math.min(x0 + 1, maxX);
    const z1 = Math.min(z0 + 1, maxZ);
    const fx = cx - x0;
    const fz = cz - z0;

    const h00 = heights[z0 * width + x0]!;
    const h10 = heights[z0 * width + x1]!;
    const h01 = heights[z1 * width + x0]!;
    const h11 = heights[z1 * width + x1]!;

    const h = (h00 * (1 - fx) * (1 - fz)
             + h10 * fx * (1 - fz)
             + h01 * (1 - fx) * fz
             + h11 * fx * fz) * scaleY;

    return y - h;
  };
}

/**
 * Convert RGBA image data to HeightmapData using the R channel (0-255 → 0-1).
 */
export function imageToHeightmap(
  rgba: Uint8Array,
  width: number,
  depth: number,
  opts?: { scaleX?: number; scaleZ?: number; scaleY?: number; offsetX?: number; offsetZ?: number },
): HeightmapData {
  const pixelCount = width * depth;
  const heights = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    heights[i] = rgba[i * 4]! / 255;
  }
  return {
    heights,
    width,
    depth,
    scaleX: opts?.scaleX ?? 1,
    scaleZ: opts?.scaleZ ?? 1,
    scaleY: opts?.scaleY ?? 1,
    offsetX: opts?.offsetX,
    offsetZ: opts?.offsetZ,
  };
}

