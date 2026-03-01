import { describe, it, expect, beforeEach } from 'vitest';
import { AudioClip } from '../audio-clip.js';
import { setAudioContext } from '../audio-context.js';
import { createMockAudioContext } from './audio-context.test.js';

describe('AudioClip', () => {
  beforeEach(() => {
    setAudioContext(createMockAudioContext());
  });

  it('creates an empty clip with name', () => {
    const clip = new AudioClip('test');
    expect(clip.name).toBe('test');
    expect(clip.loaded).toBe(false);
    expect(clip.duration).toBe(0);
    expect(clip.buffer).toBeNull();
  });

  it('creates a clip with a pre-existing buffer', () => {
    const mockBuffer = { duration: 3.0 } as AudioBuffer;
    const clip = AudioClip.fromBuffer('sfx', mockBuffer);
    expect(clip.loaded).toBe(true);
    expect(clip.duration).toBe(3.0);
    expect(clip.buffer).toBe(mockBuffer);
  });

  it('decodes audio from ArrayBuffer', async () => {
    const clip = new AudioClip('decoded');
    const fakeData = new ArrayBuffer(16);
    await clip.decodeFromArrayBuffer(fakeData);
    expect(clip.loaded).toBe(true);
    expect(clip.duration).toBe(2.5);
  });
});
