import RAPIER from '@dimforge/rapier3d-compat';
import { Joint } from './joint.js';
import type { JointOptions } from './joint.js';

export type FixedJointOptions = JointOptions;

export class FixedJoint extends Joint {
  protected _createJointData(): RAPIER.JointData {
    const frame1 = { x: 0, y: 0, z: 0, w: 1 };
    const frame2 = { x: 0, y: 0, z: 0, w: 1 };
    return RAPIER.JointData.fixed(this._toXYZ(this.anchor), frame1, this._toXYZ(this.connectedAnchor), frame2);
  }
}
