import { fbm3D } from "@atmos/math";
import type { DensityFn } from "@atmos/terrain";

const NOISE_SCALE = 0.02;
const SEA_LEVEL = 0;
const DEPTH_WEIGHT = 0.04;

/**
 * Pure 3D density: deeper = more solid, noise carves caves & overhangs.
 * Positive = air, negative = solid, surface at 0.
 */
export const terrainDensity: DensityFn = (x, y, z) => {
  const nx = x * NOISE_SCALE;
  const ny = y * NOISE_SCALE;
  const nz = z * NOISE_SCALE;

  const n = fbm3D(nx, ny, nz, 5, 2.0, 0.5);
  const bias = (y - SEA_LEVEL) * DEPTH_WEIGHT;

  return bias + n;
};
