import { describe, it, expect } from 'vitest';
import {
  sphereDensity,
  planeDensity,
  boxDensity,
  unionDensity,
  intersectDensity,
  subtractDensity,
  noiseTerrain,
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
