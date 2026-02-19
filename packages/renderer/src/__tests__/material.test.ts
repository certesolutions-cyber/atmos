import { describe, it, expect } from 'vitest';
import { createMaterial, writeMaterialUniforms, MATERIAL_UNIFORM_SIZE } from '../material.js';

describe('createMaterial', () => {
  it('has sensible defaults', () => {
    const m = createMaterial();
    expect(m.albedo[0]).toBe(1);
    expect(m.albedo[1]).toBe(1);
    expect(m.albedo[2]).toBe(1);
    expect(m.albedo[3]).toBe(1);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBe(0.5);
    expect(m.dirty).toBe(true);
  });

  it('accepts custom params', () => {
    const m = createMaterial({ albedo: [1, 0, 0, 1], metallic: 0.8, roughness: 0.2 });
    expect(m.albedo[0]).toBe(1);
    expect(m.albedo[1]).toBe(0);
    expect(m.metallic).toBe(0.8);
    expect(m.roughness).toBe(0.2);
  });

  it('uniform layout matches expected size', () => {
    expect(MATERIAL_UNIFORM_SIZE).toBe(32); // vec4 + f32 + f32 + pad8
  });

  it('writeMaterialUniforms fills buffer correctly', () => {
    const m = createMaterial({ albedo: [0.5, 0.6, 0.7, 1], metallic: 0.3, roughness: 0.9 });
    const buf = new Float32Array(8);
    writeMaterialUniforms(buf, m);
    expect(buf[0]).toBeCloseTo(0.5, 5);
    expect(buf[1]).toBeCloseTo(0.6, 5);
    expect(buf[2]).toBeCloseTo(0.7, 5);
    expect(buf[3]).toBeCloseTo(1, 5);
    expect(buf[4]).toBeCloseTo(0.3, 5);
    expect(buf[5]).toBeCloseTo(0.9, 5);
  });
});
