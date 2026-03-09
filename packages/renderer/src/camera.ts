import { Component, Scene } from '@certe/atmos-core';
import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';

/** Loose interface to avoid circular import with RenderSystem. */
export interface ScreenToWorldProvider {
  screenToWorldPoint(x: number, y: number, nearClip?: number): Promise<Float32Array | null>;
}

export class Camera extends Component {
  fovY = Math.PI / 4;
  near = 0.1;
  far = 1000;
  isMainCamera = false;
  clearColor = new Float32Array([0.05, 0.05, 0.1, 1.0]);

  skyMode: 'none' | 'procedural' = 'none';
  skyZenithColor = new Float32Array([0.10, 0.22, 0.55]);
  skyHorizonColor = new Float32Array([0.62, 0.74, 0.88]);
  skyGroundColor = new Float32Array([0.18, 0.12, 0.08]);
  skyGroundFalloff = 5.0;
  skySunIntensity = 1.5;

  /** Set by RenderSystem when it activates a camera. */
  static _renderSystem: ScreenToWorldProvider | null = null;

  private readonly _viewMatrix: Mat4Type = Mat4.create();

  get viewMatrix(): Mat4Type {
    return this._viewMatrix;
  }

  /** Compute view matrix as inverse of the camera's world transform. */
  updateViewMatrix(): void {
    Mat4.invert(this._viewMatrix, this.gameObject.transform.worldMatrix);
  }

  /** Extract world-space position from the worldMatrix translation column. */
  getWorldPosition(out: Float32Array): Float32Array {
    const m = this.gameObject.transform.worldMatrix;
    out[0] = m[12]!;
    out[1] = m[13]!;
    out[2] = m[14]!;
    return out;
  }

  /**
   * Convert screen pixel coordinates to a world-space point using GPU depth readback.
   * Returns null if the pixel is sky (depth >= 1.0) or closer than nearClip.
   */
  async screenToWorldPoint(x: number, y: number, nearClip?: number): Promise<Float32Array | null> {
    if (!Camera._renderSystem) return null;
    return Camera._renderSystem.screenToWorldPoint(x, y, nearClip);
  }

  /** Shortcut: get the main camera from the currently active scene. */
  static get main(): Camera | null {
    if (!Scene.current) return null;
    return Camera.getMain(Scene.current);
  }

  /** Find the first enabled Camera with isMainCamera=true in the scene. */
  static getMain(scene: Scene): Camera | null {
    for (const obj of scene.getAllObjects()) {
      const cam = obj.getComponent(Camera);
      if (cam && cam.enabled && cam.isMainCamera) {
        return cam;
      }
    }
    return null;
  }
}
