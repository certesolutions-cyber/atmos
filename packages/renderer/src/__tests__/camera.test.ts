import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../camera.js';
import { GameObject, resetGameObjectIds, Scene } from '@atmos/core';
import { Mat4 } from '@atmos/math';

describe('Camera', () => {
  beforeEach(() => resetGameObjectIds());

  it('has correct default values', () => {
    const go = new GameObject('Cam');
    const cam = go.addComponent(Camera);
    expect(cam.fovY).toBeCloseTo(Math.PI / 4);
    expect(cam.near).toBeCloseTo(0.1);
    expect(cam.far).toBe(100);
    expect(cam.isMainCamera).toBe(false);
  });

  it('computes view matrix as inverse of world matrix', () => {
    const go = new GameObject('Cam');
    go.transform.setPosition(0, 2, 5);
    go.transform.updateWorldMatrix();

    const cam = go.addComponent(Camera);
    cam.updateViewMatrix();

    const expected = Mat4.create();
    Mat4.invert(expected, go.transform.worldMatrix);
    for (let i = 0; i < 16; i++) {
      expect(cam.viewMatrix[i]).toBeCloseTo(expected[i]!, 5);
    }
  });

  it('computes view matrix at identity', () => {
    const go = new GameObject('Cam');
    go.transform.updateWorldMatrix();

    const cam = go.addComponent(Camera);
    cam.updateViewMatrix();

    // Identity world → identity view
    const expected = Mat4.create();
    Mat4.identity(expected);
    for (let i = 0; i < 16; i++) {
      expect(cam.viewMatrix[i]).toBeCloseTo(expected[i]!, 5);
    }
  });

  it('getWorldPosition extracts translation from world matrix', () => {
    const go = new GameObject('Cam');
    go.transform.setPosition(3, 7, -2);
    go.transform.updateWorldMatrix();

    const cam = go.addComponent(Camera);
    const pos = new Float32Array(3);
    cam.getWorldPosition(pos);

    expect(pos[0]).toBeCloseTo(3);
    expect(pos[1]).toBeCloseTo(7);
    expect(pos[2]).toBeCloseTo(-2);
  });

  describe('getMain', () => {
    it('finds the main camera in the scene', () => {
      const scene = new Scene();
      const go1 = new GameObject('Cam1');
      go1.addComponent(Camera);

      const go2 = new GameObject('Cam2');
      const cam2 = go2.addComponent(Camera);
      cam2.isMainCamera = true;

      scene.add(go1);
      scene.add(go2);
      expect(Camera.getMain(scene)).toBe(cam2);
    });

    it('returns null when no main camera exists', () => {
      const scene = new Scene();
      const go = new GameObject('Cam');
      go.addComponent(Camera);
      scene.add(go);

      expect(Camera.getMain(scene)).toBeNull();
    });

    it('returns null for empty scene', () => {
      const scene = new Scene();
      expect(Camera.getMain(scene)).toBeNull();
    });

    it('ignores disabled cameras', () => {
      const scene = new Scene();
      const go = new GameObject('Cam');
      const cam = go.addComponent(Camera);
      cam.isMainCamera = true;
      cam.enabled = false;
      scene.add(go);

      expect(Camera.getMain(scene)).toBeNull();
    });
  });
});
