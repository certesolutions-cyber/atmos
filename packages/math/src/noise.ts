/**
 * Simple 2D value noise — no dependencies.
 * Uses a hash-based pseudo-random lattice with smooth interpolation.
 */

/** Deterministic hash for integer coordinates → [0, 1) */
function hash(ix: number, iz: number): number {
  // Large primes for mixing
  let h = (ix * 374761393 + iz * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h & 0x7FFFFFFF) / 0x7FFFFFFF;
}

/** Smoothstep (Hermite) interpolation */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Lerp */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 2D value noise at (x, z). Returns a value in approximately [-1, 1].
 * @param x World X coordinate (pre-scaled by caller)
 * @param z World Z coordinate (pre-scaled by caller)
 */
export function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  const v00 = hash(ix, iz);
  const v10 = hash(ix + 1, iz);
  const v01 = hash(ix, iz + 1);
  const v11 = hash(ix + 1, iz + 1);

  const top = lerp(v00, v10, fx);
  const bot = lerp(v01, v11, fx);
  // Map from [0,1] to [-1,1]
  return lerp(top, bot, fz) * 2 - 1;
}

/**
 * Fractal Brownian Motion (fBm) using value noise.
 * Stacks multiple octaves for natural-looking terrain.
 */
export function fbm(
  x: number, z: number,
  octaves = 4, lacunarity = 2, persistence = 0.5,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * frequency, z * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmp;
}

// ---------------------------------------------------------------------------
// 3D Perlin noise (improved, gradient-lattice)
// ---------------------------------------------------------------------------

/** 12 gradient vectors — edges of a cube (Perlin standard). */
const GRAD3 = [
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
];

/** Permutation table (256 entries, doubled to avoid modulo). */
const PERM = new Uint8Array(512);
{
  const p = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
    57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
    65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
    200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
    52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
    207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
    119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
    218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
    81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
    184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
    222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  ];
  for (let i = 0; i < 256; i++) PERM[i] = PERM[i + 256] = p[i]!;
}

/** Improved Perlin fade: 6t^5 - 15t^4 + 10t^3 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Dot product with one of the 12 gradient vectors. */
function grad3dot(hash: number, x: number, y: number, z: number): number {
  const idx = (hash % 12) * 3;
  return GRAD3[idx]! * x + GRAD3[idx + 1]! * y + GRAD3[idx + 2]! * z;
}

/**
 * 3D Perlin noise. Returns a value in approximately [-1, 1].
 */
export function perlinNoise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  // Hash 8 corners
  const A = PERM[X]! + Y;
  const AA = PERM[A]! + Z;
  const AB = PERM[A + 1]! + Z;
  const B = PERM[X + 1]! + Y;
  const BA = PERM[B]! + Z;
  const BB = PERM[B + 1]! + Z;

  // Gradient dots + trilinear interpolation
  return lerp(
    lerp(
      lerp(grad3dot(PERM[AA]!, xf, yf, zf), grad3dot(PERM[BA]!, xf - 1, yf, zf), u),
      lerp(grad3dot(PERM[AB]!, xf, yf - 1, zf), grad3dot(PERM[BB]!, xf - 1, yf - 1, zf), u),
      v,
    ),
    lerp(
      lerp(grad3dot(PERM[AA + 1]!, xf, yf, zf - 1), grad3dot(PERM[BA + 1]!, xf - 1, yf, zf - 1), u),
      lerp(grad3dot(PERM[AB + 1]!, xf, yf - 1, zf - 1), grad3dot(PERM[BB + 1]!, xf - 1, yf - 1, zf - 1), u),
      v,
    ),
    w,
  );
}

/**
 * Fractal Brownian Motion using 3D Perlin noise.
 */
export function fbm3D(
  x: number, y: number, z: number,
  octaves = 4, lacunarity = 2, persistence = 0.5,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += perlinNoise3D(x * frequency, y * frequency, z * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmp;
}
