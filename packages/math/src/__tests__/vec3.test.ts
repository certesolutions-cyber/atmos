import { describe, it, expect } from 'vitest';
import * as Vec3 from '../vec3.js';

function expectVec3Close(v: Vec3.Vec3, x: number, y: number, z: number) {
  expect(v[0]).toBeCloseTo(x, 5);
  expect(v[1]).toBeCloseTo(y, 5);
  expect(v[2]).toBeCloseTo(z, 5);
}

describe('Vec3', () => {
  it('create returns zero vector', () => {
    const v = Vec3.create();
    expectVec3Close(v, 0, 0, 0);
  });

  it('fromValues sets components', () => {
    const v = Vec3.fromValues(1, 2, 3);
    expectVec3Close(v, 1, 2, 3);
  });

  it('set modifies vector in place', () => {
    const v = Vec3.create();
    Vec3.set(v, 4, 5, 6);
    expectVec3Close(v, 4, 5, 6);
  });

  it('copy duplicates a vector', () => {
    const a = Vec3.fromValues(1, 2, 3);
    const out = Vec3.create();
    Vec3.copy(out, a);
    expectVec3Close(out, 1, 2, 3);
  });

  it('add sums two vectors', () => {
    const a = Vec3.fromValues(1, 2, 3);
    const b = Vec3.fromValues(4, 5, 6);
    const out = Vec3.create();
    Vec3.add(out, a, b);
    expectVec3Close(out, 5, 7, 9);
  });

  it('sub subtracts two vectors', () => {
    const a = Vec3.fromValues(4, 5, 6);
    const b = Vec3.fromValues(1, 2, 3);
    const out = Vec3.create();
    Vec3.sub(out, a, b);
    expectVec3Close(out, 3, 3, 3);
  });

  it('scale multiplies by scalar', () => {
    const a = Vec3.fromValues(1, 2, 3);
    const out = Vec3.create();
    Vec3.scale(out, a, 2);
    expectVec3Close(out, 2, 4, 6);
  });

  it('dot computes dot product', () => {
    const a = Vec3.fromValues(1, 0, 0);
    const b = Vec3.fromValues(0, 1, 0);
    expect(Vec3.dot(a, b)).toBeCloseTo(0, 5);

    const c = Vec3.fromValues(1, 2, 3);
    const d = Vec3.fromValues(4, 5, 6);
    expect(Vec3.dot(c, d)).toBeCloseTo(32, 5);
  });

  it('cross computes cross product', () => {
    const x = Vec3.fromValues(1, 0, 0);
    const y = Vec3.fromValues(0, 1, 0);
    const out = Vec3.create();
    Vec3.cross(out, x, y);
    expectVec3Close(out, 0, 0, 1);
  });

  it('length computes magnitude', () => {
    const v = Vec3.fromValues(3, 4, 0);
    expect(Vec3.length(v)).toBeCloseTo(5, 5);
  });

  it('normalize produces unit vector', () => {
    const v = Vec3.fromValues(3, 0, 0);
    const out = Vec3.create();
    Vec3.normalize(out, v);
    expectVec3Close(out, 1, 0, 0);
    expect(Vec3.length(out)).toBeCloseTo(1, 5);
  });

  it('normalize of zero vector returns zero', () => {
    const v = Vec3.create();
    const out = Vec3.create();
    Vec3.normalize(out, v);
    expectVec3Close(out, 0, 0, 0);
  });

  it('supports out parameter aliasing', () => {
    const a = Vec3.fromValues(1, 2, 3);
    const b = Vec3.fromValues(4, 5, 6);
    Vec3.add(a, a, b);
    expectVec3Close(a, 5, 7, 9);
  });

  it('transformQuat rotates vector by 90° around Y', () => {
    const v = Vec3.fromValues(1, 0, 0);
    const q = new Float32Array(4);
    // 90° around Y: sin(45°)=√2/2
    const s = Math.sin(Math.PI / 4);
    q[0] = 0; q[1] = s; q[2] = 0; q[3] = Math.cos(Math.PI / 4);
    const out = Vec3.create();
    Vec3.transformQuat(out, v, q);
    expectVec3Close(out, 0, 0, -1);
  });

  it('transformQuat with identity quaternion is no-op', () => {
    const v = Vec3.fromValues(3, 4, 5);
    const q = new Float32Array([0, 0, 0, 1]);
    const out = Vec3.create();
    Vec3.transformQuat(out, v, q);
    expectVec3Close(out, 3, 4, 5);
  });
});
