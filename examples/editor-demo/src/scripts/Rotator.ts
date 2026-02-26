import { Component } from '@certe/atmos-core';
import type { PropertyDef } from '@certe/atmos-core';
import { Quat } from '@certe/atmos-math';
import type { QuatType } from '@certe/atmos-math';

export class Rotator extends Component {
  speed = 1.0;
  private readonly _tmpQuat: QuatType = Quat.create();

  /** Properties exposed in the editor inspector */
  static editorProperties: PropertyDef[] = [
    { key: 'speed', type: 'number', min: 0, max: 10, step: 0.1 },
  ];

  onUpdate(dt: number): void {
    const t = this.gameObject.transform;
    Quat.rotateY(this._tmpQuat, t.rotation, this.speed * dt);
    Quat.normalize(this._tmpQuat, this._tmpQuat);
    t.setRotationFrom(this._tmpQuat);
  }
}
