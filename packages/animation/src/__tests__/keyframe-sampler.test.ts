import { describe, it, expect } from 'vitest';
import { sampleTrack } from '../keyframe-sampler.js';
import type { KeyframeTrack } from '../animation-clip.js';

function makeTrack(
  channel: 'translation' | 'rotation' | 'scale',
  times: number[],
  values: number[],
  interpolation: 'LINEAR' | 'STEP' = 'LINEAR',
): KeyframeTrack {
  return {
    jointIndex: 0,
    channel,
    interpolation,
    times: new Float32Array(times),
    values: new Float32Array(values),
  };
}

describe('sampleTrack', () => {
  it('clamps to first keyframe when time < start', () => {
    const track = makeTrack('translation', [1, 2], [10, 20, 30, 40, 50, 60]);
    const out = new Float32Array(3);
    sampleTrack(out, track, 0);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
    expect(out[2]).toBe(30);
  });

  it('clamps to last keyframe when time > end', () => {
    const track = makeTrack('translation', [1, 2], [10, 20, 30, 40, 50, 60]);
    const out = new Float32Array(3);
    sampleTrack(out, track, 5);
    expect(out[0]).toBe(40);
    expect(out[1]).toBe(50);
    expect(out[2]).toBe(60);
  });

  it('linearly interpolates translation at midpoint', () => {
    const track = makeTrack('translation', [0, 1], [0, 0, 0, 10, 20, 30]);
    const out = new Float32Array(3);
    sampleTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(10);
    expect(out[2]).toBeCloseTo(15);
  });

  it('step interpolation returns first keyframe value', () => {
    const track = makeTrack('translation', [0, 1], [0, 0, 0, 10, 20, 30], 'STEP');
    const out = new Float32Array(3);
    sampleTrack(out, track, 0.5);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it('interpolates rotation (slerp)', () => {
    // Identity to 90° around Y
    const s = Math.sin(Math.PI / 4);
    const c = Math.cos(Math.PI / 4);
    const track = makeTrack('rotation', [0, 1], [0, 0, 0, 1, 0, s, 0, c]);
    const out = new Float32Array(4);
    sampleTrack(out, track, 0.5);
    // Should be ~45° around Y
    const halfS = Math.sin(Math.PI / 8);
    const halfC = Math.cos(Math.PI / 8);
    expect(out[0]).toBeCloseTo(0, 4);
    expect(out[1]).toBeCloseTo(halfS, 4);
    expect(out[2]).toBeCloseTo(0, 4);
    expect(out[3]).toBeCloseTo(halfC, 4);
  });

  it('handles multiple keyframes with binary search', () => {
    const track = makeTrack('translation', [0, 1, 2, 3], [
      0, 0, 0,
      10, 0, 0,
      10, 10, 0,
      10, 10, 10,
    ]);
    const out = new Float32Array(3);

    sampleTrack(out, track, 1.5);
    expect(out[0]).toBeCloseTo(10);
    expect(out[1]).toBeCloseTo(5);
    expect(out[2]).toBeCloseTo(0);
  });

  it('returns unchanged out for empty track', () => {
    const track = makeTrack('translation', [], []);
    const out = new Float32Array([99, 99, 99]);
    sampleTrack(out, track, 0.5);
    expect(out[0]).toBe(99);
  });

  it('interpolates scale', () => {
    const track = makeTrack('scale', [0, 1], [1, 1, 1, 2, 3, 4]);
    const out = new Float32Array(3);
    sampleTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(1.5);
    expect(out[1]).toBeCloseTo(2);
    expect(out[2]).toBeCloseTo(2.5);
  });
});
