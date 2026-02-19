import { describe, it, expect } from 'vitest';
import { computeBoundingSphere } from '../bounds.js';

describe('computeBoundingSphere', () => {
  it('computes correct sphere for unit cube vertices', () => {
    // 8 vertices of a unit cube, stride 3 (position only)
    const vertices = new Float32Array([
      -0.5, -0.5, -0.5,
       0.5, -0.5, -0.5,
      -0.5,  0.5, -0.5,
       0.5,  0.5, -0.5,
      -0.5, -0.5,  0.5,
       0.5, -0.5,  0.5,
      -0.5,  0.5,  0.5,
       0.5,  0.5,  0.5,
    ]);

    const bs = computeBoundingSphere(vertices, 3);

    // Center should be at origin
    expect(bs.center[0]).toBeCloseTo(0, 5);
    expect(bs.center[1]).toBeCloseTo(0, 5);
    expect(bs.center[2]).toBeCloseTo(0, 5);

    // Radius should be half-diagonal of unit cube = sqrt(0.75)
    expect(bs.radius).toBeCloseTo(Math.sqrt(0.75), 4);
  });

  it('handles stride with extra data', () => {
    // position(3) + normal(3) + uv(2) = 8 stride
    const vertices = new Float32Array([
      1, 0, 0, 0, 0, 0, 0, 0,
      -1, 0, 0, 0, 0, 0, 0, 0,
    ]);

    const bs = computeBoundingSphere(vertices, 8);
    expect(bs.center[0]).toBeCloseTo(0, 5);
    expect(bs.radius).toBeCloseTo(1, 5);
  });

  it('returns zero sphere for empty vertices', () => {
    const bs = computeBoundingSphere(new Float32Array(0), 3);
    expect(bs.radius).toBe(0);
  });

  it('returns zero-radius sphere for single vertex', () => {
    const vertices = new Float32Array([5, 3, 1]);
    const bs = computeBoundingSphere(vertices, 3);
    expect(bs.center[0]).toBeCloseTo(5, 5);
    expect(bs.center[1]).toBeCloseTo(3, 5);
    expect(bs.center[2]).toBeCloseTo(1, 5);
    expect(bs.radius).toBe(0);
  });
});
