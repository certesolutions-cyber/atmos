import { describe, it, expect } from 'vitest';
import * as Ray from '../ray.js';
import * as Vec3 from '../vec3.js';
import * as Mat4 from '../mat4.js';

describe('Ray', () => {
  it('create returns default ray', () => {
    const r = Ray.create();
    expect(r.origin[0]).toBe(0);
    expect(r.origin[1]).toBe(0);
    expect(r.origin[2]).toBe(0);
    expect(r.direction[0]).toBe(0);
    expect(r.direction[1]).toBe(0);
    expect(r.direction[2]).toBe(-1);
  });

  describe('fromScreenCoords', () => {
    it('center of screen with identity invVP gives ray along +Z (WebGPU NDC 0..1)', () => {
      const r = Ray.create();
      const invVP = Mat4.create();
      Mat4.identity(invVP);

      Ray.fromScreenCoords(r, 400, 300, 800, 600, invVP);
      // Identity invVP: near z=0, far z=1 -> direction is (0,0,1) in WebGPU NDC
      expect(r.direction[2]).toBeGreaterThan(0);
      expect(Math.abs(r.direction[0]!)).toBeLessThan(0.01);
      expect(Math.abs(r.direction[1]!)).toBeLessThan(0.01);
    });

    it('produces normalized direction', () => {
      const r = Ray.create();
      const invVP = Mat4.create();
      Mat4.identity(invVP);

      Ray.fromScreenCoords(r, 200, 100, 800, 600, invVP);
      const len = Vec3.length(r.direction);
      expect(len).toBeCloseTo(1, 5);
    });
  });

  describe('intersectSphere', () => {
    it('hit: ray through sphere center', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 0, 5);
      Vec3.set(r.direction, 0, 0, -1);

      const center = Vec3.fromValues(0, 0, 0);
      const t = Ray.intersectSphere(r, center, 1);
      expect(t).toBeCloseTo(4, 5);
    });

    it('miss: ray parallel to sphere', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 5, 5);
      Vec3.set(r.direction, 0, 0, -1);

      const center = Vec3.fromValues(0, 0, 0);
      const t = Ray.intersectSphere(r, center, 1);
      expect(t).toBe(-1);
    });

    it('behind: sphere behind ray origin', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 0, 5);
      Vec3.set(r.direction, 0, 0, 1); // pointing away

      const center = Vec3.fromValues(0, 0, 0);
      const t = Ray.intersectSphere(r, center, 1);
      expect(t).toBe(-1);
    });

    it('origin inside sphere: returns positive t', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 0, 0);
      Vec3.set(r.direction, 0, 0, -1);

      const center = Vec3.fromValues(0, 0, 0);
      const t = Ray.intersectSphere(r, center, 2);
      expect(t).toBeCloseTo(2, 5);
    });
  });

  describe('intersectPlane', () => {
    it('hit: ray pointing down to XZ plane', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 5, 0);
      Vec3.set(r.direction, 0, -1, 0);

      const normal = Vec3.fromValues(0, 1, 0);
      const t = Ray.intersectPlane(r, normal, 0);
      expect(t).toBeCloseTo(5, 5);
    });

    it('parallel: returns -1', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 5, 0);
      Vec3.set(r.direction, 1, 0, 0); // parallel to plane

      const normal = Vec3.fromValues(0, 1, 0);
      const t = Ray.intersectPlane(r, normal, 0);
      expect(t).toBe(-1);
    });

    it('behind: returns -1', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 5, 0);
      Vec3.set(r.direction, 0, 1, 0); // pointing away from plane

      const normal = Vec3.fromValues(0, 1, 0);
      const t = Ray.intersectPlane(r, normal, 0);
      expect(t).toBe(-1);
    });
  });

  describe('intersectTriangle', () => {
    it('hit: ray through center of XZ triangle', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 5, 0);
      Vec3.set(r.direction, 0, -1, 0);

      const v0 = Vec3.fromValues(-1, 0, -1);
      const v1 = Vec3.fromValues(1, 0, -1);
      const v2 = Vec3.fromValues(0, 0, 1);

      const t = Ray.intersectTriangle(r, v0, v1, v2);
      expect(t).toBeCloseTo(5, 5);
    });

    it('miss: ray outside triangle', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 10, 5, 0);
      Vec3.set(r.direction, 0, -1, 0);

      const v0 = Vec3.fromValues(-1, 0, -1);
      const v1 = Vec3.fromValues(1, 0, -1);
      const v2 = Vec3.fromValues(0, 0, 1);

      const t = Ray.intersectTriangle(r, v0, v1, v2);
      expect(t).toBe(-1);
    });

    it('miss: ray parallel to triangle', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 0, -5);
      Vec3.set(r.direction, 1, 0, 0); // parallel to XZ

      const v0 = Vec3.fromValues(-1, 0, -1);
      const v1 = Vec3.fromValues(1, 0, -1);
      const v2 = Vec3.fromValues(0, 0, 1);

      const t = Ray.intersectTriangle(r, v0, v1, v2);
      expect(t).toBe(-1);
    });

    it('miss: triangle behind ray', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0, 5, 0);
      Vec3.set(r.direction, 0, 1, 0); // pointing away

      const v0 = Vec3.fromValues(-1, 0, -1);
      const v1 = Vec3.fromValues(1, 0, -1);
      const v2 = Vec3.fromValues(0, 0, 1);

      const t = Ray.intersectTriangle(r, v0, v1, v2);
      expect(t).toBe(-1);
    });

    it('hit: ray at oblique angle', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 0.1, 3, 0.1);
      const dir = Vec3.fromValues(0, -1, 0);
      Vec3.normalize(dir, dir);
      Vec3.copy(r.direction, dir);

      const v0 = Vec3.fromValues(-1, 0, -1);
      const v1 = Vec3.fromValues(1, 0, -1);
      const v2 = Vec3.fromValues(0, 0, 1);

      const t = Ray.intersectTriangle(r, v0, v1, v2);
      expect(t).toBeCloseTo(3, 4);
    });
  });

  describe('pointOnRay', () => {
    it('computes correct point', () => {
      const r = Ray.create();
      Vec3.set(r.origin, 1, 2, 3);
      Vec3.set(r.direction, 0, 0, -1);

      const out = Vec3.create();
      Ray.pointOnRay(out, r, 5);
      expect(out[0]).toBeCloseTo(1, 5);
      expect(out[1]).toBeCloseTo(2, 5);
      expect(out[2]).toBeCloseTo(-2, 5);
    });
  });
});
