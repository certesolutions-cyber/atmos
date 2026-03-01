import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameObject } from '@certe/atmos-core';
import { AudioListener } from '../audio-listener.js';
import { setAudioContext } from '../audio-context.js';
import { createMockAudioContext } from './audio-context.test.js';

describe('AudioListener', () => {
  let mockCtx: AudioContext;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    setAudioContext(mockCtx);
  });

  it('creates a gain node on awake', () => {
    const go = new GameObject('Camera');
    const listener = go.addComponent(AudioListener);
    listener.onAwake!();

    expect(mockCtx.createGain).toHaveBeenCalledOnce();
    expect(listener.gain).not.toBeNull();
  });

  it('connects gain to destination on awake', () => {
    const go = new GameObject('Camera');
    const listener = go.addComponent(AudioListener);
    listener.onAwake!();

    expect(listener.gain!.connect).toHaveBeenCalledWith(mockCtx.destination);
  });

  it('syncs listener position from world transform on render', () => {
    const go = new GameObject('Camera');
    const listener = go.addComponent(AudioListener);
    listener.onAwake!();

    // Set a known world matrix (identity with translation at 5, 10, 15)
    go.transform.setPosition(5, 10, 15);
    go.transform.updateWorldMatrix();

    listener.onRender!();

    const audioListener = mockCtx.listener as unknown as {
      positionX: { setValueAtTime: ReturnType<typeof vi.fn> };
      positionY: { setValueAtTime: ReturnType<typeof vi.fn> };
      positionZ: { setValueAtTime: ReturnType<typeof vi.fn> };
    };
    expect(audioListener.positionX.setValueAtTime).toHaveBeenCalledWith(5, 0);
    expect(audioListener.positionY.setValueAtTime).toHaveBeenCalledWith(10, 0);
    expect(audioListener.positionZ.setValueAtTime).toHaveBeenCalledWith(15, 0);
  });

  it('updates master volume on render', () => {
    const go = new GameObject('Camera');
    const listener = go.addComponent(AudioListener);
    listener.onAwake!();

    listener.masterVolume = 0.5;
    listener.onRender!();

    expect(listener.gain!.gain.value).toBe(0.5);
  });

  it('disconnects gain on destroy', () => {
    const go = new GameObject('Camera');
    const listener = go.addComponent(AudioListener);
    listener.onAwake!();

    const gainNode = listener.gain!;
    listener.onDestroy!();

    expect(gainNode.disconnect).toHaveBeenCalledOnce();
    expect(listener.gain).toBeNull();
  });
});
