import { describe, it, expect } from 'vitest';
import { CAMERA_PRESETS, applyCameraPreset } from '../camera-presets.js';
import { OrbitCamera } from '../orbit-camera.js';
import { Vec3 } from '@certe/atmos-math';

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

describe('Camera Presets', () => {
  it('has 6 presets', () => {
    expect(CAMERA_PRESETS.length).toBe(6);
  });

  it('presets have valid names', () => {
    const names = CAMERA_PRESETS.map((p) => p.name);
    expect(names).toContain('Front');
    expect(names).toContain('Back');
    expect(names).toContain('Left');
    expect(names).toContain('Right');
    expect(names).toContain('Top');
    expect(names).toContain('Bottom');
  });

  it('applyCameraPreset sets orbit angles', () => {
    const camera = createTestCamera();
    const orbit = new OrbitCamera(camera);
    const front = CAMERA_PRESETS.find((p) => p.name === 'Front')!;

    applyCameraPreset(orbit, front, camera);
    expect(orbit.azimuth).toBe(front.azimuth);
    expect(orbit.elevation).toBe(front.elevation);
  });

  it('applyCameraPreset updates camera eye', () => {
    const camera = createTestCamera();
    const orbit = new OrbitCamera(camera);
    const top = CAMERA_PRESETS.find((p) => p.name === 'Top')!;

    applyCameraPreset(orbit, top, camera);
    // Top view: eye should be above target
    expect(camera.eye[1]).toBeGreaterThan(camera.target[1]!);
  });

  it('Front and Back have opposite azimuths', () => {
    const front = CAMERA_PRESETS.find((p) => p.name === 'Front')!;
    const back = CAMERA_PRESETS.find((p) => p.name === 'Back')!;
    expect(Math.abs(back.azimuth - front.azimuth)).toBeCloseTo(Math.PI, 3);
  });
});
