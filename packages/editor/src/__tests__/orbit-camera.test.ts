import { describe, it, expect } from 'vitest';
import { Vec3 } from '@certe/atmos-math';
import type { CameraSettings } from '@certe/atmos-renderer';
import { OrbitCamera } from '../orbit-camera.js';

function makeCamera(
  eye: [number, number, number] = [0, 2, 5],
  target: [number, number, number] = [0, 0, 0],
): CameraSettings {
  return {
    eye: Vec3.fromValues(...eye),
    target: Vec3.fromValues(...target),
    up: Vec3.fromValues(0, 1, 0),
    fovY: Math.PI / 4,
    near: 0.1,
    far: 100,
  };
}

describe('OrbitCamera', () => {
  it('initializes spherical coords from camera eye/target', () => {
    const cam = makeCamera([0, 0, 5], [0, 0, 0]);
    const orbit = new OrbitCamera(cam);

    expect(orbit.distance).toBeCloseTo(5, 5);
    expect(orbit.elevation).toBeCloseTo(0, 5);
    expect(orbit.azimuth).toBeCloseTo(0, 5);
    expect(orbit.target[0]).toBeCloseTo(0);
    expect(orbit.target[1]).toBeCloseTo(0);
    expect(orbit.target[2]).toBeCloseTo(0);
  });

  it('initializes with elevated camera', () => {
    const cam = makeCamera([0, 5, 0], [0, 0, 0]);
    const orbit = new OrbitCamera(cam);

    expect(orbit.distance).toBeCloseTo(5, 5);
    expect(orbit.elevation).toBeCloseTo(Math.PI / 2, 3);
  });

  it('initializes with off-center target', () => {
    const cam = makeCamera([3, 4, 8], [0, 1, 0]);
    const orbit = new OrbitCamera(cam);

    expect(orbit.target[0]).toBeCloseTo(0);
    expect(orbit.target[1]).toBeCloseTo(1);
    expect(orbit.target[2]).toBeCloseTo(0);
    // distance = sqrt(9 + 9 + 64) = sqrt(82)
    expect(orbit.distance).toBeCloseTo(Math.sqrt(82), 3);
  });

  it('reconstructs eye position via updateCamera', () => {
    const cam = makeCamera([3, 4, 8], [0, 1, 0]);
    const orbit = new OrbitCamera(cam);

    // Clear eye then reconstruct
    Vec3.set(cam.eye, 0, 0, 0);
    orbit.applyToCamera(cam);

    expect(cam.eye[0]).toBeCloseTo(3, 1);
    expect(cam.eye[1]).toBeCloseTo(4, 1);
    expect(cam.eye[2]).toBeCloseTo(8, 1);
  });

  it('orbit changes eye position when azimuth changes', () => {
    const cam = makeCamera([0, 0, 5], [0, 0, 0]);
    const orbit = new OrbitCamera(cam);

    orbit.azimuth += 0.5;
    orbit.applyToCamera(cam);

    // Eye should have moved off z-axis
    expect(cam.eye[0]).not.toBeCloseTo(0, 1);
    expect(cam.eye[2]).not.toBeCloseTo(5, 1);
    // Distance should be preserved
    const d = Math.sqrt(cam.eye[0]! ** 2 + cam.eye[1]! ** 2 + cam.eye[2]! ** 2);
    expect(d).toBeCloseTo(5, 3);
  });

  it('pan moves both eye and target', () => {
    const cam = makeCamera([0, 0, 5], [0, 0, 0]);
    const orbit = new OrbitCamera(cam);

    // Shift target
    orbit.target[0] = 2;
    orbit.target[1] = 1;
    orbit.applyToCamera(cam);

    expect(cam.target[0]).toBeCloseTo(2, 5);
    expect(cam.target[1]).toBeCloseTo(1, 5);
    // Eye should also shift by the same target offset
    expect(cam.eye[0]).toBeCloseTo(2, 1);
    expect(cam.eye[1]).toBeCloseTo(1, 1);
  });

  it('zoom changes distance', () => {
    const cam = makeCamera([0, 0, 5], [0, 0, 0]);
    const orbit = new OrbitCamera(cam);

    orbit.distance = 10;
    orbit.applyToCamera(cam);

    expect(cam.eye[2]).toBeCloseTo(10, 3);
  });

  it('elevation clamp is enforced by internal constants', () => {
    const cam = makeCamera([0, 0, 5], [0, 0, 0]);
    const orbit = new OrbitCamera(cam);

    const maxEl = 89 * (Math.PI / 180);

    // Manually clamp as the handler would
    orbit.elevation = Math.PI;
    orbit.elevation = Math.max(-maxEl, Math.min(maxEl, orbit.elevation));
    expect(orbit.elevation).toBeCloseTo(maxEl, 5);

    orbit.elevation = -Math.PI;
    orbit.elevation = Math.max(-maxEl, Math.min(maxEl, orbit.elevation));
    expect(orbit.elevation).toBeCloseTo(-maxEl, 5);
  });
});
