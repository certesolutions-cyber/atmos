import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAudioContext,
  setAudioContext,
  resumeAudioContext,
  suspendAudioContext,
  closeAudioContext,
} from '../audio-context.js';

function createMockAudioContext(): AudioContext {
  return {
    state: 'running',
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    listener: {
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() },
      forwardX: { setValueAtTime: vi.fn() },
      forwardY: { setValueAtTime: vi.fn() },
      forwardZ: { setValueAtTime: vi.fn() },
      upX: { setValueAtTime: vi.fn() },
      upY: { setValueAtTime: vi.fn() },
      upZ: { setValueAtTime: vi.fn() },
    },
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn().mockReturnValue({
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createPanner: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() },
      orientationX: { setValueAtTime: vi.fn() },
      orientationY: { setValueAtTime: vi.fn() },
      orientationZ: { setValueAtTime: vi.fn() },
    }),
    createBufferSource: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null,
      loop: false,
      playbackRate: { value: 1 },
      onended: null,
    }),
    decodeAudioData: vi.fn().mockResolvedValue({
      duration: 2.5,
      length: 110250,
      numberOfChannels: 2,
      sampleRate: 44100,
    }),
  } as unknown as AudioContext;
}

describe('AudioContext singleton', () => {
  let mockCtx: AudioContext;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    setAudioContext(mockCtx);
  });

  it('returns the injected context', () => {
    expect(getAudioContext()).toBe(mockCtx);
  });

  it('resumeAudioContext calls resume on context', async () => {
    await resumeAudioContext();
    expect(mockCtx.resume).toHaveBeenCalledOnce();
  });

  it('suspendAudioContext calls suspend on context', async () => {
    await suspendAudioContext();
    expect(mockCtx.suspend).toHaveBeenCalledOnce();
  });

  it('closeAudioContext calls close and clears singleton', async () => {
    await closeAudioContext();
    expect(mockCtx.close).toHaveBeenCalledOnce();
  });

  it('suspendAudioContext is noop when no context exists', async () => {
    setAudioContext(null);
    await suspendAudioContext(); // should not throw
  });

  it('closeAudioContext is noop when no context exists', async () => {
    setAudioContext(null);
    await closeAudioContext(); // should not throw
  });
});

export { createMockAudioContext };
