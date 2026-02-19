import RAPIER from '@dimforge/rapier3d-compat';
import { Joint } from './joint.js';
import type { JointOptions } from './joint.js';
import type { PhysicsWorld } from './physics-world.js';

export interface SpringJointOptions extends JointOptions {
  restLength?: number;
  stiffness?: number;
  damping?: number;
}

export class SpringJoint extends Joint {
  restLength = 1.0;
  stiffness = 10.0;
  damping = 1.0;

  init(world: PhysicsWorld, options?: SpringJointOptions): void {
    if (options?.restLength !== undefined) this.restLength = options.restLength;
    if (options?.stiffness !== undefined) this.stiffness = options.stiffness;
    if (options?.damping !== undefined) this.damping = options.damping;
    super.init(world, options);
  }

  protected _createJointData(): RAPIER.JointData {
    return RAPIER.JointData.spring(
      this.restLength,
      this.stiffness,
      this.damping,
      this._toXYZ(this.anchor),
      this._toXYZ(this.connectedAnchor),
    );
  }
}
