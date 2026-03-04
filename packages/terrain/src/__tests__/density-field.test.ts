import { describe, it, expect } from 'vitest';
import {
  sphereDensity,
  planeDensity,
  boxDensity,
  unionDensity,
  intersectDensity,
  subtractDensity,
  noiseTerrain,
  heightFnTerrain,
  heightmapTerrain,
  imageToHeightmap,
} from '../density-field.js';

describe('sphereDensity', () => {
  const sphere = sphereDensity(0, 0, 0, 5);

  it('returns negative inside', () => {
    expect(sphere(0, 0, 0)).toBeLessThan(0);
    expect(sphere(2, 0, 0)).toBeLessThan(0);
  });

  it('returns zero on surface', () => {
    expect(sphere(5, 0, 0)).toBeCloseTo(0);
    expect(sphere(0, 5, 0)).toBeCloseTo(0);
  });

  it('returns positive outside', () => {
    expect(sphere(6, 0, 0)).toBeGreaterThan(0);
    expect(sphere(10, 10, 10)).toBeGreaterThan(0);
  });
});

describe('planeDensity', () => {
  const plane = planeDensity(5);

  it('returns negative below', () => {
    expect(plane(0, 3, 0)).toBeLessThan(0);
  });

  it('returns zero on surface', () => {
    expect(plane(0, 5, 0)).toBeCloseTo(0);
  });

  it('returns positive above', () => {
    expect(plane(0, 7, 0)).toBeGreaterThan(0);
  });
});

describe('boxDensity', () => {
  const box = boxDensity(0, 0, 0, 2, 2, 2);

  it('returns negative inside', () => {
    expect(box(0, 0, 0)).toBeLessThan(0);
    expect(box(1, 1, 1)).toBeLessThan(0);
  });

  it('returns zero on surface', () => {
    expect(box(2, 0, 0)).toBeCloseTo(0);
  });

  it('returns positive outside', () => {
    expect(box(3, 0, 0)).toBeGreaterThan(0);
  });
});

describe('CSG operations', () => {
  const sphereA = sphereDensity(0, 0, 0, 3);
  const sphereB = sphereDensity(2, 0, 0, 3);

  it('union: solid where either is solid', () => {
    const u = unionDensity(sphereA, sphereB);
    // Center of A is inside both
    expect(u(0, 0, 0)).toBeLessThan(0);
    // Far right, inside B only
    expect(u(4, 0, 0)).toBeLessThan(0);
    // Far left, inside A only
    expect(u(-2, 0, 0)).toBeLessThan(0);
    // Outside both
    expect(u(10, 0, 0)).toBeGreaterThan(0);
  });

  it('intersection: solid where both are solid', () => {
    const i = intersectDensity(sphereA, sphereB);
    // Center, inside both
    expect(i(1, 0, 0)).toBeLessThan(0);
    // Inside A only
    expect(i(-2.5, 0, 0)).toBeGreaterThan(0);
  });

  it('subtraction: A minus B', () => {
    const s = subtractDensity(sphereA, sphereB);
    // Far left of A (not in B) = solid
    expect(s(-2, 0, 0)).toBeLessThan(0);
    // Center of B = subtracted away
    expect(s(2, 0, 0)).toBeGreaterThan(0);
  });
});

describe('noiseTerrain', () => {
  it('creates height-based density', () => {
    const flat = noiseTerrain(() => 0, 5, 10);
    // Below base height = solid
    expect(flat(0, 8, 0)).toBeLessThan(0);
    // Above base height = air
    expect(flat(0, 12, 0)).toBeGreaterThan(0);
    // At base height = surface
    expect(flat(0, 10, 0)).toBeCloseTo(0);
  });
});

describe('heightFnTerrain', () => {
  it('flat height function', () => {
    const density = heightFnTerrain(() => 5);
    expect(density(0, 3, 0)).toBeLessThan(0);  // below = solid
    expect(density(0, 5, 0)).toBeCloseTo(0);    // at surface
    expect(density(0, 7, 0)).toBeGreaterThan(0); // above = air
  });

  it('sloped height function', () => {
    const density = heightFnTerrain((x, _z) => x * 2);
    // At x=3 height=6
    expect(density(3, 4, 0)).toBeLessThan(0);
    expect(density(3, 6, 0)).toBeCloseTo(0);
    expect(density(3, 8, 0)).toBeGreaterThan(0);
  });
});

describe('heightmapTerrain', () => {
  // 3x3 heightmap:
  //  0  1  2
  //  3  4  5
  //  6  7  8
  const heights = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const data = { heights, width: 3, depth: 3, scaleX: 1, scaleZ: 1, scaleY: 1 };

  it('exact grid point', () => {
    const density = heightmapTerrain(data);
    // At (1,0,1) height=4, so density = 0-4 = -4
    expect(density(1, 0, 1)).toBeCloseTo(-4);
    // At surface
    expect(density(1, 4, 1)).toBeCloseTo(0);
  });

  it('bilinear interpolation between grid points', () => {
    const density = heightmapTerrain(data);
    // At (0.5, y, 0): between h[0]=0 and h[1]=1 → height=0.5
    expect(density(0.5, 0.5, 0)).toBeCloseTo(0);
    // At (0.5, y, 0.5): bilinear of 0,1,3,4 → (0*0.25 + 1*0.25 + 3*0.25 + 4*0.25) = 2
    expect(density(0.5, 2, 0.5)).toBeCloseTo(0);
  });

  it('clamps at edges (infinite extension)', () => {
    const density = heightmapTerrain(data);
    // At x=-5 clamps to x=0, z=0 → height = heights[0] = 0
    expect(density(-5, 0, 0)).toBeCloseTo(0);
    // At x=100 clamps to x=2, z=2 → height = heights[2*3+2] = 8
    expect(density(100, 8, 100)).toBeCloseTo(0);
  });

  it('respects scaleY', () => {
    const scaled = heightmapTerrain({ ...data, scaleY: 10 });
    // At (1,0,1) height=4*10=40
    expect(scaled(1, 40, 1)).toBeCloseTo(0);
  });

  it('respects offset', () => {
    const offset = heightmapTerrain({ ...data, offsetX: 10, offsetZ: 20 });
    // World (11, y, 21) → grid (1, 1) → height=4
    expect(offset(11, 4, 21)).toBeCloseTo(0);
  });
});

describe('imageToHeightmap', () => {
  it('reads R channel and normalizes to [0,1]', () => {
    // 2x2 RGBA image: R values = 0, 128, 255, 64
    const rgba = new Uint8Array([
      0, 0, 0, 255,
      128, 0, 0, 255,
      255, 0, 0, 255,
      64, 0, 0, 255,
    ]);
    const hm = imageToHeightmap(rgba, 2, 2);
    expect(hm.width).toBe(2);
    expect(hm.depth).toBe(2);
    expect(hm.heights[0]).toBeCloseTo(0);
    expect(hm.heights[1]).toBeCloseTo(128 / 255);
    expect(hm.heights[2]).toBeCloseTo(1);
    expect(hm.heights[3]).toBeCloseTo(64 / 255);
  });

  it('applies scale options', () => {
    const rgba = new Uint8Array([100, 0, 0, 255]);
    const hm = imageToHeightmap(rgba, 1, 1, { scaleX: 2, scaleZ: 3, scaleY: 50 });
    expect(hm.scaleX).toBe(2);
    expect(hm.scaleZ).toBe(3);
    expect(hm.scaleY).toBe(50);
  });
});
