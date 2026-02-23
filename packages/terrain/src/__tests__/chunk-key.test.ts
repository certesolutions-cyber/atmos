import { describe, it, expect } from 'vitest';
import { chunkKey, fromChunkKey, worldToChunk } from '../chunk-key.js';

describe('chunkKey', () => {
  it('round-trips positive coordinates', () => {
    expect(fromChunkKey(chunkKey(3, 7, 12))).toEqual([3, 7, 12]);
  });

  it('round-trips negative coordinates', () => {
    expect(fromChunkKey(chunkKey(-5, -1, -100))).toEqual([-5, -1, -100]);
  });

  it('round-trips zero', () => {
    expect(fromChunkKey(chunkKey(0, 0, 0))).toEqual([0, 0, 0]);
  });

  it('round-trips boundary values', () => {
    expect(fromChunkKey(chunkKey(-511, 511, 0))).toEqual([-511, 511, 0]);
    expect(fromChunkKey(chunkKey(-512, 0, 511))).toEqual([-512, 0, 511]);
  });

  it('produces unique keys for different coordinates', () => {
    const a = chunkKey(1, 2, 3);
    const b = chunkKey(3, 2, 1);
    const c = chunkKey(1, 3, 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
});

describe('worldToChunk', () => {
  it('converts positive coordinates', () => {
    // chunkWorldSize = 16*1 = 16
    expect(worldToChunk(17, 5, 33, 16)).toEqual([1, 0, 2]);
  });

  it('converts negative coordinates', () => {
    expect(worldToChunk(-1, -17, 0, 16)).toEqual([-1, -2, 0]);
  });

  it('converts coordinates at origin', () => {
    expect(worldToChunk(0, 0, 0, 16)).toEqual([0, 0, 0]);
  });

  it('handles non-integer voxel sizes', () => {
    // chunkWorldSize = 8 * 0.5 = 4
    expect(worldToChunk(5, 0, -3, 4)).toEqual([1, 0, -1]);
  });
});
