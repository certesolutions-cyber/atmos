import { Component } from '@certe/atmos-core';
import type { PropertyDef } from '@certe/atmos-core';
import { Quat } from '@certe/atmos-math';
import type { QuatType } from '@certe/atmos-math';

/** Rotates the attached GameObject around Y and X axes each frame */
export class Rotator extends Component {
  speedX = 0.5;
  speedY = 1.0;

  static editorProperties: PropertyDef[] = [
    { key: 'speedX', type: 'number', min: -10, max: 10, step: 0.1 },
    { key: 'speedY', type: 'number', min: -10, max: 10, step: 0.1 },
  ];

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
