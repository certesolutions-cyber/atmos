import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPicker } from '../object-picker.js';
import { Scene, GameObject } from '@certe/atmos-core';
import { Vec3 } from '@certe/atmos-math';

// Minimal mock for MeshRenderer since it needs GPU resources
class MockMeshRenderer {
  enabled = true;
  private _center: Float32Array;
  private _radius: number;

  constructor(center: Float32Array, radius: number) {
    this._center = center;
    this._radius = radius;
  }

  get worldBoundingSphere() {
    return { center: this._center, radius: this._radius };
  }
}

// Mock camera looking down -Z
function createTestCamera() {
  return {
    eye: Vec3.fromValues(0, 0, 5),
    target: Vec3.fromValues(0, 0, 0),
    up: Vec3.fromValues(0, 1, 0),
    fovY: Math.PI / 4,
    near: 0.1,
    far: 100,
  };
}

// Mock canvas
function createTestCanvas(w: number, h: number) {
  return {
    clientWidth: w,
    clientHeight: h,
  } as HTMLCanvasElement;
}

describe('ObjectPicker', () => {
  let picker: ObjectPicker;

  beforeEach(() => {
    picker = new ObjectPicker();
  });

  it('picks object at screen center', () => {
    const scene = new Scene();
    const obj = new GameObject('Target');

    // Manually set up a mock MeshRenderer via prototype hack
    const mr = new MockMeshRenderer(Vec3.fromValues(0, 0, 0), 1);
    vi.spyOn(obj, 'getComponent').mockReturnValue(mr as never);

    scene.add(obj);

    const camera = createTestCamera();
    const canvas = createTestCanvas(800, 600);

    const result = picker.pick(400, 300, scene, camera, canvas);
    expect(result).not.toBeNull();
    expect(result!.gameObject).toBe(obj);
    expect(result!.distance).toBeGreaterThan(0);
  });

  it('returns null when no objects hit', () => {
    const scene = new Scene();
    const obj = new GameObject('Far');

    const mr = new MockMeshRenderer(Vec3.fromValues(100, 100, 0), 0.5);
    vi.spyOn(obj, 'getComponent').mockReturnValue(mr as never);

    scene.add(obj);

    const camera = createTestCamera();
    const canvas = createTestCanvas(800, 600);

    const result = picker.pick(400, 300, scene, camera, canvas);
    expect(result).toBeNull();
  });

  it('picks nearest of two objects', () => {
    const scene = new Scene();

    const near = new GameObject('Near');
    const mrNear = new MockMeshRenderer(Vec3.fromValues(0, 0, 2), 1);
    vi.spyOn(near, 'getComponent').mockReturnValue(mrNear as never);
    scene.add(near);

    const far = new GameObject('Far');
    const mrFar = new MockMeshRenderer(Vec3.fromValues(0, 0, -2), 1);
    vi.spyOn(far, 'getComponent').mockReturnValue(mrFar as never);
    scene.add(far);

    const camera = createTestCamera();
    const canvas = createTestCanvas(800, 600);

    const result = picker.pick(400, 300, scene, camera, canvas);
    expect(result).not.toBeNull();
    expect(result!.gameObject).toBe(near);
  });

  it('returns null for empty scene', () => {
    const scene = new Scene();
    const camera = createTestCamera();
    const canvas = createTestCanvas(800, 600);

    const result = picker.pick(400, 300, scene, camera, canvas);
    expect(result).toBeNull();
  });
});
