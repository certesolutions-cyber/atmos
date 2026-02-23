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

  it('writeSceneUniforms fills buffer with fallback light', () => {
    const light = createDirectionalLight([0, -1, 0], [1, 1, 1], 1.5);
    const cameraPos = new Float32Array([5, 10, 15]);
    const buf = new Float32Array(SCENE_UNIFORM_SIZE / 4);
    writeSceneUniforms(buf, cameraPos, undefined, light);

    // cameraPos at offset 0
    expect(buf[0]).toBeCloseTo(5, 5);
    expect(buf[1]).toBeCloseTo(10, 5);
    expect(buf[2]).toBeCloseTo(15, 5);
    expect(buf[3]).toBe(0); // w

    // numDirLights=1, numPointLights=0 (stored as u32 at byte offset 16)
    const u32 = new Uint32Array(buf.buffer, 16, 2);
    expect(u32[0]).toBe(1);
    expect(u32[1]).toBe(0);

    // First dir light at float offset 8: direction(vec4) + color(vec4)
    expect(buf[8]).toBeCloseTo(0, 5);    // dir.x
    expect(buf[9]).toBeCloseTo(-1, 5);   // dir.y
    expect(buf[10]).toBeCloseTo(0, 5);   // dir.z
    expect(buf[11]).toBe(0);             // dir.w
    expect(buf[12]).toBeCloseTo(1, 5);   // color.r
    expect(buf[13]).toBeCloseTo(1, 5);   // color.g
    expect(buf[14]).toBeCloseTo(1, 5);   // color.b
    expect(buf[15]).toBeCloseTo(1.5, 5); // color.w = intensity
  });
});
