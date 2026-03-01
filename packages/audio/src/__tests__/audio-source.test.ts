import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameObject, Scene } from '@certe/atmos-core';
import { AudioSource } from '../audio-source.js';
import { AudioListener } from '../audio-listener.js';
import { AudioClip } from '../audio-clip.js';
import { setAudioContext } from '../audio-context.js';
import { createMockAudioContext } from './audio-context.test.js';

describe('AudioSource', () => {
  let mockCtx: AudioContext;
  let scene: Scene;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    setAudioContext(mockCtx);
    scene = new Scene();
    Scene.current = scene;
  });

  function makeListenerGO(): GameObject {
    const go = new GameObject('Camera');
    const listener = go.addComponent(AudioListener);
    listener.onAwake!();
    scene.add(go);
    return go;
  }

  /** Simulates engine lifecycle: awake → clip assignment → start */
  function makeSourceGO(clip?: AudioClip): { go: GameObject; source: AudioSource } {
    const go = new GameObject('Sound');
    const source = go.addComponent(AudioSource);
    go.transform.updateWorldMatrix();
    scene.add(go);

    // Engine calls onAwake (creates nodes)
    source.onAwake!();

    // Script sets clip (like ToneEmitter would in its own onStart)
    if (clip) source.clip = clip;

    return { go, source };
  }

  it('has correct default values', () => {
    const go = new GameObject('Sound');
    const source = go.addComponent(AudioSource);
    expect(source.volume).toBe(1);
    expect(source.pitch).toBe(1);
    expect(source.loop).toBe(false);
    expect(source.autoplay).toBe(false);
    expect(source.spatial).toBe(true);
    expect(source.clipUrl).toBe('');
    expect(source.distanceModel).toBe('inverse');
    expect(source.refDistance).toBe(1);
    expect(source.maxDistance).toBe(100);
    expect(source.rolloffFactor).toBe(1);
    expect(source.playing).toBe(false);
  });

  it('creates audio nodes on awake', () => {
    makeListenerGO();
    const { source } = makeSourceGO();
    expect(mockCtx.createPanner).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2); // listener + source
    void source;
  });

  it('plays a clip', () => {
    makeListenerGO();
    const mockBuffer = { duration: 2.0 } as AudioBuffer;
    const { source } = makeSourceGO(AudioClip.fromBuffer('test', mockBuffer));
    source.play();

    expect(source.playing).toBe(true);
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
  });

  it('does not play without a clip', () => {
    const { source } = makeSourceGO();
    source.play();
    expect(source.playing).toBe(false);
  });

  it('stops playback', () => {
    makeListenerGO();
    const mockBuffer = { duration: 2.0 } as AudioBuffer;
    const { source } = makeSourceGO(AudioClip.fromBuffer('test', mockBuffer));
    source.play();

    expect(source.playing).toBe(true);
    source.stop();
    expect(source.playing).toBe(false);
  });

  it('pauses and resumes playback', () => {
    makeListenerGO();
    const mockBuffer = { duration: 2.0 } as AudioBuffer;
    const { source } = makeSourceGO(AudioClip.fromBuffer('test', mockBuffer));
    source.play();

    expect(source.playing).toBe(true);
    source.pause();
    expect(source.playing).toBe(false);

    source.play();
    expect(source.playing).toBe(true);
  });

  it('autoplays on start when clip is already loaded', () => {
    makeListenerGO();
    const mockBuffer = { duration: 2.0 } as AudioBuffer;
    const { source } = makeSourceGO(AudioClip.fromBuffer('test', mockBuffer));
    source.autoplay = true;

    // Engine calls onStart after all components are awake
    source.onStart!();
    expect(source.playing).toBe(true);
  });

  it('syncs panner position on render', () => {
    makeListenerGO();
    const { go, source } = makeSourceGO();
    void source;

    go.transform.setPosition(3, 6, 9);
    go.transform.updateWorldMatrix();
    source.onRender!();

    const panner = (mockCtx.createPanner as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(3, 0);
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(6, 0);
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(9, 0);
  });

  it('syncs volume on render', () => {
    makeListenerGO();
    const { source } = makeSourceGO();

    source.volume = 0.3;
    source.onRender!();

    const gainNode = (mockCtx.createGain as ReturnType<typeof vi.fn>).mock.results[1]!.value;
    expect(gainNode.gain.value).toBe(0.3);
  });

  it('cleans up nodes on destroy', () => {
    makeListenerGO();
    const mockBuffer = { duration: 2.0 } as AudioBuffer;
    const { source } = makeSourceGO(AudioClip.fromBuffer('test', mockBuffer));
    source.play();

    source.onDestroy!();
    expect(source.playing).toBe(false);
  });
});
