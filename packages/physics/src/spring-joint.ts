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
  private _restLength = 1.0;
  private _stiffness = 10.0;
  private _damping = 1.0;

  get restLength(): number { return this._restLength; }
  set restLength(v: number) { this._restLength = v; this._recreateJoint(); }

  get stiffness(): number { return this._stiffness; }
  set stiffness(v: number) { this._stiffness = v; this._recreateJoint(); }

  get damping(): number { return this._damping; }
  set damping(v: number) { this._damping = v; this._recreateJoint(); }

  init(world: PhysicsWorld, options?: SpringJointOptions): void {
    if (options?.restLength !== undefined) this._restLength = options.restLength;
    if (options?.stiffness !== undefined) this._stiffness = options.stiffness;
    if (options?.damping !== undefined) this._damping = options.damping;
    super.init(world, options);
  }

  protected _createJointData(): RAPIER.JointData {
    return RAPIER.JointData.spring(
      this._restLength,
      this._stiffness,
      this._damping,
      this._toXYZ(this.anchor),
      this._toXYZ(this.connectedAnchor),
    );
  }
}
