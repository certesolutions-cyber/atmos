import { describe, it, expect } from 'vitest';
import * as Mat4 from '../mat4.js';
import * as Vec3 from '../vec3.js';
import * as Quat from '../quat.js';

function expectMat4Close(m: Mat4.Mat4, expected: number[]) {
  for (let i = 0; i < 16; i++) {
    expect(m[i]).toBeCloseTo(expected[i]!, 4);
  }
}

const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

describe('Mat4', () => {
  it('identity produces identity matrix', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    expectMat4Close(m, IDENTITY);
  });

  it('multiply by identity yields same matrix', () => {
    const a = Mat4.create();
    Mat4.identity(a);
    Mat4.translate(a, a, Vec3.fromValues(1, 2, 3));

    const id = Mat4.create();
    Mat4.identity(id);
    const out = Mat4.create();
    Mat4.multiply(out, a, id);

    expectMat4Close(out, Array.from(a));
  });

  it('translate moves the translation column', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.translate(m, m, Vec3.fromValues(5, 10, 15));
    expect(m[12]).toBeCloseTo(5, 5);
    expect(m[13]).toBeCloseTo(10, 5);
    expect(m[14]).toBeCloseTo(15, 5);
  });

  it('scale scales the diagonal', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.scale(m, m, Vec3.fromValues(2, 3, 4));
    expect(m[0]).toBeCloseTo(2, 5);
    expect(m[5]).toBeCloseTo(3, 5);
    expect(m[10]).toBeCloseTo(4, 5);
  });

  it('rotateX rotates around X axis', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.rotateX(m, m, Math.PI / 2);
    // Y axis should map to Z axis
    expect(m[5]).toBeCloseTo(0, 4);
    expect(m[6]).toBeCloseTo(1, 4);
    expect(m[9]).toBeCloseTo(-1, 4);
    expect(m[10]).toBeCloseTo(0, 4);
  });

  it('rotateY rotates around Y axis', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.rotateY(m, m, Math.PI / 2);
    expect(m[0]).toBeCloseTo(0, 4);
    expect(m[8]).toBeCloseTo(1, 4);
  });

  it('rotateZ rotates around Z axis', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.rotateZ(m, m, Math.PI / 2);
    expect(m[0]).toBeCloseTo(0, 4);
    expect(m[1]).toBeCloseTo(1, 4);
  });

  it('perspective produces valid projection', () => {
    const m = Mat4.create();
    Mat4.perspective(m, Math.PI / 4, 16 / 9, 0.1, 100);
    expect(m[0]).toBeGreaterThan(0);
    expect(m[5]).toBeGreaterThan(0);
    expect(m[11]).toBeCloseTo(-1, 5);
    expect(m[15]).toBeCloseTo(0, 5);
  });

  it('lookAt produces valid view matrix', () => {
    const m = Mat4.create();
    const eye = Vec3.fromValues(0, 0, 5);
    const center = Vec3.fromValues(0, 0, 0);
    const up = Vec3.fromValues(0, 1, 0);
    Mat4.lookAt(m, eye, center, up);
    // Should move world -5 in z
    expect(m[14]).toBeCloseTo(-5, 4);
  });

  it('invert of identity is identity', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    const inv = Mat4.create();
    const result = Mat4.invert(inv, m);
    expect(result).not.toBeNull();
    expectMat4Close(inv, IDENTITY);
  });

  it('invert of translation negates translation', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.translate(m, m, Vec3.fromValues(3, 4, 5));
    const inv = Mat4.create();
    Mat4.invert(inv, m);
    expect(inv[12]).toBeCloseTo(-3, 4);
    expect(inv[13]).toBeCloseTo(-4, 4);
    expect(inv[14]).toBeCloseTo(-5, 4);
  });

  it('M * M^-1 = identity', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.translate(m, m, Vec3.fromValues(1, 2, 3));
    Mat4.rotateX(m, m, 0.5);
    Mat4.scale(m, m, Vec3.fromValues(2, 2, 2));

    const inv = Mat4.create();
    Mat4.invert(inv, m);
    const result = Mat4.create();
    Mat4.multiply(result, m, inv);
    expectMat4Close(result, IDENTITY);
  });

  it('transpose swaps rows and columns', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.translate(m, m, Vec3.fromValues(1, 2, 3));
    const t = Mat4.create();
    Mat4.transpose(t, m);
    // column-major: m[12]=1, m[13]=2, m[14]=3 → row-major: t[3]=1, t[7]=2, t[11]=3
    expect(t[3]).toBeCloseTo(1, 5);
    expect(t[7]).toBeCloseTo(2, 5);
    expect(t[11]).toBeCloseTo(3, 5);
  });

  it('transpose round-trip returns original', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.translate(m, m, Vec3.fromValues(1, 2, 3));
    Mat4.rotateX(m, m, 0.5);
    const original = new Float32Array(m);
    const t = Mat4.create();
    Mat4.transpose(t, m);
    Mat4.transpose(t, t);
    expectMat4Close(t, Array.from(original));
  });

  it('transpose supports aliased out (out === a)', () => {
    const m = Mat4.create();
    Mat4.identity(m);
    Mat4.translate(m, m, Vec3.fromValues(4, 5, 6));
    const copy = new Float32Array(m);
    const expected = Mat4.create();
    Mat4.transpose(expected, m);
    Mat4.transpose(m, m);
    expectMat4Close(m, Array.from(expected));
  });

  it('fromRotationTranslationScale composes TRS', () => {
    const q = Quat.create();
    Quat.identity(q);
    const v = Vec3.fromValues(1, 2, 3);
    const s = Vec3.fromValues(1, 1, 1);
    const m = Mat4.create();
    Mat4.fromRotationTranslationScale(m, q, v, s);
    expect(m[12]).toBeCloseTo(1, 5);
    expect(m[13]).toBeCloseTo(2, 5);
    expect(m[14]).toBeCloseTo(3, 5);
    expect(m[0]).toBeCloseTo(1, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(1, 5);
  });
});
