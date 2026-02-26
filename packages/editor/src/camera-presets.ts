import type { OrbitCamera } from './orbit-camera.js';
import type { CameraSettings } from '@certe/atmos-renderer';

export interface CameraPreset {
  name: string;
  azimuth: number;
  elevation: number;
}

const DEG = Math.PI / 180;

export const CAMERA_PRESETS: CameraPreset[] = [
  { name: 'Front', azimuth: 0, elevation: 0 },
  { name: 'Back', azimuth: 180 * DEG, elevation: 0 },
  { name: 'Left', azimuth: -90 * DEG, elevation: 0 },
  { name: 'Right', azimuth: 90 * DEG, elevation: 0 },
  { name: 'Top', azimuth: 0, elevation: 89 * DEG },
  { name: 'Bottom', azimuth: 0, elevation: -89 * DEG },
];

export function applyCameraPreset(
  orbit: OrbitCamera,
  preset: CameraPreset,
  camera: CameraSettings,
): void {
  orbit.azimuth = preset.azimuth;
  orbit.elevation = preset.elevation;
  orbit.applyToCamera(camera);
}
