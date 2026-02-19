import { describe, it, expect } from 'vitest';
import * as Quat from '../quat.js';
import * as Mat4 from '../mat4.js';
import * as Vec3 from '../vec3.js';

describe('Quat', () => {
  it('create returns identity quaternion', () => {
    const q = Quat.create();
    expect(q[0]).toBeCloseTo(0, 5);
    expect(q[1]).toBeCloseTo(0, 5);
    expect(q[2]).toBeCloseTo(0, 5);
    expect(q[3]).toBeCloseTo(1, 5);
  });

  it('identity sets to identity', () => {
    const q = new Float32Array([1, 2, 3, 4]);
    Quat.identity(q);
    expect(q[3]).toBeCloseTo(1, 5);
    expect(q[0]).toBeCloseTo(0, 5);
  });

  it('fromAxisAngle creates rotation around axis', () => {
    const q = Quat.create();
    const axis = Vec3.fromValues(0, 1, 0);
    Quat.fromAxisAngle(q, axis, Math.PI / 2);
    // y-axis 90 degree rotation
    const len = Math.sqrt(q[0]! ** 2 + q[1]! ** 2 + q[2]! ** 2 + q[3]! ** 2);
    expect(len).toBeCloseTo(1, 5);
    expect(q[1]).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(q[3]).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it('fromEuler creates rotation from euler angles', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0, 0, 0);
    expect(q[3]).toBeCloseTo(1, 5);

    Quat.fromEuler(q, Math.PI / 2, 0, 0);
    const len = Math.sqrt(q[0]! ** 2 + q[1]! ** 2 + q[2]! ** 2 + q[3]! ** 2);
    expect(len).toBeCloseTo(1, 5);
  });

  it('multiply combines rotations', () => {
    const a = Quat.create();
    const b = Quat.create();
    const axis = Vec3.fromValues(0, 1, 0);
    Quat.fromAxisAngle(a, axis, Math.PI / 2);
    Quat.fromAxisAngle(b, axis, Math.PI / 2);

    const out = Quat.create();
    Quat.multiply(out, a, b);
    // Two 90-degree rotations = 180-degree rotation
    expect(out[1]).toBeCloseTo(1, 4);
    expect(out[3]).toBeCloseTo(0, 4);
  });

  it('normalize produces unit quaternion', () => {
    const q = new Float32Array([1, 2, 3, 4]);
    const out = Quat.create();
    Quat.normalize(out, q);
    const len = Math.sqrt(out[0]! ** 2 + out[1]! ** 2 + out[2]! ** 2 + out[3]! ** 2);
    expect(len).toBeCloseTo(1, 5);
  });

  it('slerp interpolates between quaternions', () => {
    const a = Quat.create();
    const b = Quat.create();
    const axis = Vec3.fromValues(0, 1, 0);
    Quat.fromAxisAngle(a, axis, 0);
    Quat.fromAxisAngle(b, axis, Math.PI);

    const mid = Quat.create();
    Quat.slerp(mid, a, b, 0.5);
    const len = Math.sqrt(mid[0]! ** 2 + mid[1]! ** 2 + mid[2]! ** 2 + mid[3]! ** 2);
    expect(len).toBeCloseTo(1, 5);

    // At t=0, should equal a
    const start = Quat.create();
    Quat.slerp(start, a, b, 0);
    expect(start[3]).toBeCloseTo(a[3]!, 5);

    // At t=1, should equal b
    const end = Quat.create();
    Quat.slerp(end, a, b, 1);
    expect(end[1]).toBeCloseTo(b[1]!, 4);
  });

  it('toEuler returns zero for identity quaternion', () => {
    const q = Quat.create(); // identity [0,0,0,1]
    const euler = Vec3.create();
    Quat.toEuler(euler, q);
    expect(euler[0]).toBeCloseTo(0, 5);
    expect(euler[1]).toBeCloseTo(0, 5);
    expect(euler[2]).toBeCloseTo(0, 5);
  });

  it('toEuler round-trips through fromEuler', () => {
    const original = Vec3.fromValues(0.3, 0.5, -0.2);
    const q = Quat.create();
    Quat.fromEuler(q, original[0]!, original[1]!, original[2]!);

    const euler = Vec3.create();
    Quat.toEuler(euler, q);
    expect(euler[0]).toBeCloseTo(original[0]!, 4);
    expect(euler[1]).toBeCloseTo(original[1]!, 4);
    expect(euler[2]).toBeCloseTo(original[2]!, 4);
  });

  it('toEuler handles 90-degree rotation', () => {
    const q = Quat.create();
    Quat.fromEuler(q, Math.PI / 2, 0, 0);
    const euler = Vec3.create();
    Quat.toEuler(euler, q);
    expect(euler[0]).toBeCloseTo(Math.PI / 2, 4);
    expect(euler[1]).toBeCloseTo(0, 4);
    expect(euler[2]).toBeCloseTo(0, 4);
  });

  it('fromMat4 roundtrips through toMat4', () => {
    const q = Quat.create();
    const axis = Vec3.fromValues(0, 1, 0);
    Quat.fromAxisAngle(q, axis, Math.PI / 3);

    const m = Mat4.create();
    Quat.toMat4(m, q);

    const q2 = Quat.create();
    Quat.fromMat4(q2, m);

    expect(q2[0]).toBeCloseTo(q[0]!, 4);
    expect(q2[1]).toBeCloseTo(q[1]!, 4);
    expect(q2[2]).toBeCloseTo(q[2]!, 4);
    expect(q2[3]).toBeCloseTo(q[3]!, 4);
  });

  it('fromMat4 handles scaled matrix', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0.5, 0.3, -0.2);

    // Build TRS matrix with non-uniform scale
    const m = Mat4.create();
    const pos = Vec3.fromValues(10, 20, 30);
    const scl = Vec3.fromValues(2, 3, 0.5);
    Mat4.fromRotationTranslationScale(m, q, pos, scl);

    const q2 = Quat.create();
    Quat.fromMat4(q2, m);

    expect(q2[0]).toBeCloseTo(q[0]!, 3);
    expect(q2[1]).toBeCloseTo(q[1]!, 3);
    expect(q2[2]).toBeCloseTo(q[2]!, 3);
    expect(q2[3]).toBeCloseTo(q[3]!, 3);
  });

  it('copy duplicates quaternion', () => {
    const a = new Float32Array([0.1, 0.2, 0.3, 0.9]);
    const b = Quat.create();
    Quat.copy(b, a);
    expect(b[0]).toBeCloseTo(0.1, 5);
    expect(b[1]).toBeCloseTo(0.2, 5);
    expect(b[2]).toBeCloseTo(0.3, 5);
    expect(b[3]).toBeCloseTo(0.9, 5);
  });

  it('toMat4 produces rotation matrix', () => {
    const q = Quat.create();
    Quat.identity(q);
    const m = Mat4.create();
    Quat.toMat4(m, q);
    // Identity quaternion → identity rotation matrix
    expect(m[0]).toBeCloseTo(1, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(1, 5);
    expect(m[15]).toBeCloseTo(1, 5);
  });

  it('invert produces correct inverse (q * inv(q) ≈ identity)', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0.5, 1.0, -0.3);
    const inv = Quat.create();
    Quat.invert(inv, q);
    const result = Quat.create();
    Quat.multiply(result, q, inv);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[1]).toBeCloseTo(0, 5);
    expect(result[2]).toBeCloseTo(0, 5);
    expect(result[3]).toBeCloseTo(1, 5);
  });

  it('invert of identity is identity', () => {
    const q = Quat.create();
    const inv = Quat.create();
    Quat.invert(inv, q);
    expect(inv[0]).toBeCloseTo(0, 5);
    expect(inv[1]).toBeCloseTo(0, 5);
    expect(inv[2]).toBeCloseTo(0, 5);
    expect(inv[3]).toBeCloseTo(1, 5);
  });

  it('rotateX matches fromAxisAngle + multiply', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0.3, 0.5, -0.2);
    const angle = 0.7;

    // Reference: fromAxisAngle + multiply
    const delta = Quat.create();
    Quat.fromAxisAngle(delta, Vec3.fromValues(1, 0, 0), angle);
    const expected = Quat.create();
    Quat.multiply(expected, delta, q);

    const result = Quat.create();
    Quat.rotateX(result, q, angle);

    expect(result[0]).toBeCloseTo(expected[0]!, 5);
    expect(result[1]).toBeCloseTo(expected[1]!, 5);
    expect(result[2]).toBeCloseTo(expected[2]!, 5);
    expect(result[3]).toBeCloseTo(expected[3]!, 5);
  });

  it('rotateY matches fromAxisAngle + multiply', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0.3, 0.5, -0.2);
    const angle = 0.7;

    const delta = Quat.create();
    Quat.fromAxisAngle(delta, Vec3.fromValues(0, 1, 0), angle);
    const expected = Quat.create();
    Quat.multiply(expected, delta, q);

    const result = Quat.create();
    Quat.rotateY(result, q, angle);

    expect(result[0]).toBeCloseTo(expected[0]!, 5);
    expect(result[1]).toBeCloseTo(expected[1]!, 5);
    expect(result[2]).toBeCloseTo(expected[2]!, 5);
    expect(result[3]).toBeCloseTo(expected[3]!, 5);
  });

  it('rotateZ matches fromAxisAngle + multiply', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0.3, 0.5, -0.2);
    const angle = 0.7;

    const delta = Quat.create();
    Quat.fromAxisAngle(delta, Vec3.fromValues(0, 0, 1), angle);
    const expected = Quat.create();
    Quat.multiply(expected, delta, q);

    const result = Quat.create();
    Quat.rotateZ(result, q, angle);

    expect(result[0]).toBeCloseTo(expected[0]!, 5);
    expect(result[1]).toBeCloseTo(expected[1]!, 5);
    expect(result[2]).toBeCloseTo(expected[2]!, 5);
    expect(result[3]).toBeCloseTo(expected[3]!, 5);
  });

  it('rotateY on identity produces correct single-axis rotation', () => {
    const q = Quat.create();
    Quat.rotateY(q, q, Math.PI / 2);
    expect(q[0]).toBeCloseTo(0, 5);
    expect(q[1]).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(q[2]).toBeCloseTo(0, 5);
    expect(q[3]).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it('rotateX/Y/Z work in-place (out === a)', () => {
    const q = Quat.create();
    Quat.fromEuler(q, 0.1, 0.2, 0.3);
    const copy = Quat.create();
    Quat.copy(copy, q);

    Quat.rotateX(q, q, 0.5);
    // Should have changed
    const changed = q[0] !== copy[0] || q[1] !== copy[1] || q[2] !== copy[2] || q[3] !== copy[3];
    expect(changed).toBe(true);
    // Should still be unit length
    const len = Math.sqrt(q[0]! ** 2 + q[1]! ** 2 + q[2]! ** 2 + q[3]! ** 2);
    expect(len).toBeCloseTo(1, 5);
  });
});
