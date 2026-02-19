import { describe, it, expect } from 'vitest';
import { createDirectionalLight, writeSceneUniforms, SCENE_UNIFORM_SIZE } from '../light.js';

describe('createDirectionalLight', () => {
  it('normalizes direction', () => {
    const light = createDirectionalLight([3, 0, 0]);
    expect(light.direction[0]).toBeCloseTo(1, 5);
    expect(light.direction[1]).toBeCloseTo(0, 5);
    expect(light.direction[2]).toBeCloseTo(0, 5);
  });

  it('accepts custom color and intensity', () => {
    const light = createDirectionalLight([0, -1, 0], [1, 0.5, 0.2], 2.0);
    expect(light.color[0]).toBeCloseTo(1, 5);
    expect(light.color[1]).toBeCloseTo(0.5, 5);
    expect(light.color[2]).toBeCloseTo(0.2, 5);
    expect(light.intensity).toBe(2.0);
  });

  it('writeSceneUniforms fills buffer correctly', () => {
    const light = createDirectionalLight([0, -1, 0], [1, 1, 1], 1.5);
    const cameraPos = new Float32Array([5, 10, 15]);
    const buf = new Float32Array(SCENE_UNIFORM_SIZE / 4);
    writeSceneUniforms(buf, light, cameraPos);

    // lightDir
    expect(buf[0]).toBeCloseTo(0, 5);
    expect(buf[1]).toBeCloseTo(-1, 5);
    expect(buf[2]).toBeCloseTo(0, 5);
    expect(buf[3]).toBe(0); // w

    // lightColor, w = intensity
    expect(buf[4]).toBeCloseTo(1, 5);
    expect(buf[7]).toBeCloseTo(1.5, 5);

    // cameraPos
    expect(buf[8]).toBeCloseTo(5, 5);
    expect(buf[9]).toBeCloseTo(10, 5);
    expect(buf[10]).toBeCloseTo(15, 5);
  });
});
