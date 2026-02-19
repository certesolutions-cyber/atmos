import RAPIER from '@dimforge/rapier3d-compat';
import { Vec3, Mat4 } from '@atmos/math';
import type { Vec3Type } from '@atmos/math';
import { Joint } from './joint.js';
import type { JointOptions } from './joint.js';
import type { PhysicsWorld } from './physics-world.js';

type AxisOption = { x: number; y: number; z: number } | Float32Array;

export interface HingeJointOptions extends JointOptions {
  axis?: AxisOption;
  connectedAxis?: AxisOption;
  autoConfigureConnectedAxis?: boolean;
  limitsEnabled?: boolean;
  limitMin?: number;
  limitMax?: number;
  motorEnabled?: boolean;
  motorMode?: 'velocity' | 'position';
  motorTargetVelocity?: number;
  motorMaxForce?: number;
  motorTargetPosition?: number;
  motorStiffness?: number;
  motorDamping?: number;
}

/**
 * Compute a quaternion that rotates the X-axis [1,0,0] to the given unit axis.
 * Rapier revolute joints use the X-axis of the frame as the rotation axis.
 */
function axisToFrame(ax: number, ay: number, az: number): { x: number; y: number; z: number; w: number } {
  // dot = [1,0,0] · axis = ax
  const dot = ax;
  if (dot > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.999999) return { x: 0, y: 0, z: 1, w: 0 }; // 180° around Z
  // cross = [1,0,0] × [ax,ay,az] = [0, -az, ay]
  const cx = 0, cy = -az, cz = ay;
  const w = 1 + dot;
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz + w * w);
  return { x: cx / len, y: cy / len, z: cz / len, w: w / len };
}

export class HingeJoint extends Joint {
  readonly axis: Vec3Type = Vec3.fromValues(0, 1, 0);
  readonly connectedAxis: Vec3Type = Vec3.fromValues(0, 1, 0);
  autoConfigureConnectedAxis = true;
  limitsEnabled = false;
  limitMin = -Math.PI;
  limitMax = Math.PI;

  private _motorEnabled = false;
  private _motorMode: 'velocity' | 'position' = 'velocity';
  private _motorTargetVelocity = 0;
  private _motorMaxForce = 0;
  private _motorTargetPosition = 0;
  private _motorStiffness = 0;
  private _motorDamping = 0;

  get motorEnabled(): boolean { return this._motorEnabled; }
  set motorEnabled(v: boolean) { this._motorEnabled = v; this._applyMotor(); }

  get motorMode(): 'velocity' | 'position' { return this._motorMode; }
  set motorMode(v: 'velocity' | 'position') { this._motorMode = v; this._applyMotor(); }

  get motorTargetVelocity(): number { return this._motorTargetVelocity; }
  set motorTargetVelocity(v: number) { this._motorTargetVelocity = v; this._applyMotor(); }

  get motorMaxForce(): number { return this._motorMaxForce; }
  set motorMaxForce(v: number) { this._motorMaxForce = v; this._applyMotor(); }

  get motorTargetPosition(): number { return this._motorTargetPosition; }
  set motorTargetPosition(v: number) { this._motorTargetPosition = v; this._applyMotor(); }

  get motorStiffness(): number { return this._motorStiffness; }
  set motorStiffness(v: number) { this._motorStiffness = v; this._applyMotor(); }

  get motorDamping(): number { return this._motorDamping; }
  set motorDamping(v: number) { this._motorDamping = v; this._applyMotor(); }

  init(world: PhysicsWorld, options?: HingeJointOptions): void {
    if (options?.axis) this._setVec3(this.axis, options.axis);
    if (options?.connectedAxis) {
      this._setVec3(this.connectedAxis, options.connectedAxis);
      this.autoConfigureConnectedAxis = false;
    } else if (options?.axis && !this.autoConfigureConnectedAxis) {
      this._setVec3(this.connectedAxis, options.axis);
    }
    if (options?.autoConfigureConnectedAxis !== undefined) {
      this.autoConfigureConnectedAxis = options.autoConfigureConnectedAxis;
    }
    if (options?.limitsEnabled) {
      this.limitsEnabled = true;
      this.limitMin = options.limitMin ?? -Math.PI;
      this.limitMax = options.limitMax ?? Math.PI;
    }
    if (options?.motorEnabled !== undefined) this._motorEnabled = options.motorEnabled;
    if (options?.motorMode !== undefined) this._motorMode = options.motorMode;
    if (options?.motorTargetVelocity !== undefined) this._motorTargetVelocity = options.motorTargetVelocity;
    if (options?.motorMaxForce !== undefined) this._motorMaxForce = options.motorMaxForce;
    if (options?.motorTargetPosition !== undefined) this._motorTargetPosition = options.motorTargetPosition;
    if (options?.motorStiffness !== undefined) this._motorStiffness = options.motorStiffness;
    if (options?.motorDamping !== undefined) this._motorDamping = options.motorDamping;
    super.init(world, options);
  }

  protected _tryCreateJoint(): void {
    if (this.autoConfigureConnectedAxis) {
      this._computeConnectedAxis();
    }
    super._tryCreateJoint();
    this._applyMotor();
  }

  private _computeConnectedAxis(): void {
    if (!this._connectedObject) return;
    const thisTransform = this.gameObject.transform;
    const otherTransform = this._connectedObject.transform;
    thisTransform.updateWorldMatrix();
    otherTransform.updateWorldMatrix();

    // Transform axis direction: local A → world (rotation only, no translation)
    const m = thisTransform.worldMatrix;
    const ax = this.axis[0]!, ay = this.axis[1]!, az = this.axis[2]!;
    const wx = m[0]! * ax + m[4]! * ay + m[8]! * az;
    const wy = m[1]! * ax + m[5]! * ay + m[9]! * az;
    const wz = m[2]! * ax + m[6]! * ay + m[10]! * az;

    // Transform world direction → local B (rotation only)
    const inv = Mat4.create();
    Mat4.invert(inv, otherTransform.worldMatrix);
    const lx = inv[0]! * wx + inv[4]! * wy + inv[8]! * wz;
    const ly = inv[1]! * wx + inv[5]! * wy + inv[9]! * wz;
    const lz = inv[2]! * wx + inv[6]! * wy + inv[10]! * wz;

    // Normalize
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (len > 1e-6) {
      Vec3.set(this.connectedAxis, lx / len, ly / len, lz / len);
    }
  }

  private _setVec3(target: Float32Array, src: AxisOption): void {
    if (src instanceof Float32Array) {
      Vec3.copy(target, src);
    } else {
      Vec3.set(target, src.x, src.y, src.z);
    }
  }

  private _applyMotor(): void {
    if (!this.joint) return;
    const revolute = this.joint as RAPIER.RevoluteImpulseJoint;
    if (!this._motorEnabled) {
      revolute.configureMotorVelocity(0, 0);
      return;
    }
    if (this._motorMode === 'velocity') {
      revolute.configureMotorVelocity(this._motorTargetVelocity, this._motorMaxForce);
    } else {
      revolute.configureMotorPosition(this._motorTargetPosition, this._motorStiffness, this._motorDamping);
    }
  }

  protected _createJointData(): RAPIER.JointData {
    const data = RAPIER.JointData.revolute(
      this._toXYZ(this.anchor),
      this._toXYZ(this.connectedAnchor),
      this._toXYZ(this.axis),
    );
    // Override frames so each body can have its own local axis
    data.frame1 = axisToFrame(this.axis[0]!, this.axis[1]!, this.axis[2]!);
    data.frame2 = axisToFrame(this.connectedAxis[0]!, this.connectedAxis[1]!, this.connectedAxis[2]!);
    if (this.limitsEnabled) {
      data.limitsEnabled = true;
      data.limits = [this.limitMin, this.limitMax];
    }
    return data;
  }
}
