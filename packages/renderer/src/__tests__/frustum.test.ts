import { describe, it, expect } from 'vitest';
import { extractFrustumPlanes, isSphereInFrustum } from '../frustum.js';
import * as Mat4 from '@atmos/math/src/mat4.js';
import * as Vec3 from '@atmos/math/src/vec3.js';

function makeVP(): Float32Array {
  const view = Mat4.create();
  const proj = Mat4.create();
  const vp = Mat4.create();
  Mat4.lookAt(view, Vec3.fromValues(0, 0, 5), Vec3.fromValues(0, 0, 0), Vec3.fromValues(0, 1, 0));
  Mat4.perspective(proj, Math.PI / 4, 1.0, 0.1, 100);
  Mat4.multiply(vp, proj, view);
  return vp;
}

describe('frustum culling', () => {
  it('accepts sphere at origin (in front of camera)', () => {
    const planes = new Float32Array(24);
    extractFrustumPlanes(planes, makeVP());
    const result = isSphereInFrustum(planes, {
      center: new Float32Array([0, 0, 0]),
      radius: 1,
    });
    expect(result).toBe(true);
  });

  it('rejects sphere far behind camera', () => {
    const planes = new Float32Array(24);
    extractFrustumPlanes(planes, makeVP());
    const result = isSphereInFrustum(planes, {
      center: new Float32Array([0, 0, 50]),
      radius: 1,
    });
    expect(result).toBe(false);
  });

  it('rejects sphere far to the left', () => {
    const planes = new Float32Array(24);
    extractFrustumPlanes(planes, makeVP());
    const result = isSphereInFrustum(planes, {
      center: new Float32Array([-100, 0, 0]),
      radius: 1,
    });
    expect(result).toBe(false);
  });

  it('accepts sphere partially inside frustum', () => {
    const planes = new Float32Array(24);
    extractFrustumPlanes(planes, makeVP());
    // Sphere center just outside left edge but radius overlaps
    const result = isSphereInFrustum(planes, {
      center: new Float32Array([-3, 0, 0]),
      radius: 2,
    });
    expect(result).toBe(true);
  });

  it('rejects sphere beyond far plane', () => {
    const planes = new Float32Array(24);
    extractFrustumPlanes(planes, makeVP());
    const result = isSphereInFrustum(planes, {
      center: new Float32Array([0, 0, -200]),
      radius: 1,
    });
    expect(result).toBe(false);
  });
});
