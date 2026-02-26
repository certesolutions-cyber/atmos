import { Component } from '@certe/atmos-core';
import { Quat } from '@certe/atmos-math';
import type { QuatType } from '@certe/atmos-math';

/** Rotates at a random speed around Y and X axes */
export class RandomRotator extends Component {
  speedX = (Math.random() - 0.5) * 2;
  speedY = (Math.random() - 0.5) * 3;

  private readonly _tempQuat: QuatType = Quat.create();

  onUpdate(dt: number): void {
    const t = this.gameObject.transform;
    Quat.fromEuler(this._tempQuat, this.speedX * dt, this.speedY * dt, 0);
    Quat.multiply(this._tempQuat, this._tempQuat, t.rotation);
    Quat.normalize(this._tempQuat, this._tempQuat);
    t.setRotationFrom(this._tempQuat);
  }
}
