import { Component } from '@atmos/core';
import type { Scene } from '@atmos/core';
import { Mat4 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';

export class Camera extends Component {
  fovY = Math.PI / 4;
  near = 0.1;
  far = 100;
  isMainCamera = false;
  clearColor = new Float32Array([0.05, 0.05, 0.1, 1.0]);

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
