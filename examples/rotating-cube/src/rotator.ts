import { Component } from '@atmos/core';
import { Quat } from '@atmos/math';
import type { QuatType } from '@atmos/math';

/** Rotates the attached GameObject around Y and X axes each frame */
export class Rotator extends Component {
  speedX = 0.5;
  speedY = 1.0;

  private readonly _tempQuat: QuatType = Quat.create();

  onUpdate(dt: number): void {
    const t = this.gameObject.transform;

    // Apply Y rotation
    Quat.fromEuler(this._tempQuat, this.speedX * dt, this.speedY * dt, 0);
    Quat.multiply(this._tempQuat, this._tempQuat, t.rotation);
    Quat.normalize(this._tempQuat, this._tempQuat);
    t.setRotationFrom(this._tempQuat);
  }
}
