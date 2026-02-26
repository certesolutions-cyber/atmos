import RAPIER from '@dimforge/rapier3d-compat';
import { Vec3 } from '@certe/atmos-math';
import type { Vec3Type } from '@certe/atmos-math';
import { Joint } from './joint.js';
import type { JointOptions } from './joint.js';
import type { PhysicsWorld } from './physics-world.js';
import { getWasmMemory, getLockedAxesOffset } from './init.js';

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
  private readonly _axis: Vec3Type = Vec3.fromValues(0, 1, 0);
  private readonly _connectedAxisVec: Vec3Type = Vec3.fromValues(0, 1, 0);
  private _autoConfigureConnectedAxis = true;

  // Limits — setters sync to live Rapier joint
  private _limitsEnabled = false;
  private _limitMin = -Math.PI;
  private _limitMax = Math.PI;

  // Motor
  private _motorEnabled = false;
  private _motorMode: 'velocity' | 'position' = 'velocity';
  private _motorTargetVelocity = 0;
  private _motorMaxForce = 0;
  private _motorTargetPosition = 0;
  private _motorStiffness = 0;
  private _motorDamping = 0;

  /** Current joint angle in radians. Computed from body orientations and joint frames. */
  get angle(): number {
    if (!this.joint) return 0;
    const f1 = this.joint.frameX1();
    const f2 = this.joint.frameX2();
    const r1 = this.joint.body1().rotation();
    const r2 = this.joint.body2().rotation();
    // a = r1 * f1 (quat multiply)
    const ax = r1.w * f1.x + r1.x * f1.w + r1.y * f1.z - r1.z * f1.y;
    const aw = r1.w * f1.w - r1.x * f1.x - r1.y * f1.y - r1.z * f1.z;
    const ay = r1.w * f1.y - r1.x * f1.z + r1.y * f1.w + r1.z * f1.x;
    const az = r1.w * f1.z + r1.x * f1.y - r1.y * f1.x + r1.z * f1.w;
    // b = r2 * f2
    const bx = r2.w * f2.x + r2.x * f2.w + r2.y * f2.z - r2.z * f2.y;
    const bw = r2.w * f2.w - r2.x * f2.x - r2.y * f2.y - r2.z * f2.z;
    const by = r2.w * f2.y - r2.x * f2.z + r2.y * f2.w + r2.z * f2.x;
    const bz = r2.w * f2.z + r2.x * f2.y - r2.y * f2.x + r2.z * f2.w;
    // q = conj(a) * b  — Rapier measures body2 relative to body1
    const qx = aw * bx - ax * bw - ay * bz + az * by;
    const qw = aw * bw + ax * bx + ay * by + az * bz;
    return 2 * Math.atan2(qx, qw);
  }

  // --- Axis accessors (require joint recreation) --- //

  get axis(): Vec3Type { return this._axis; }
  set axis(v: Vec3Type) {
    Vec3.copy(this._axis, v);
    if (this.joint) this._recreateJoint();
  }

  get connectedAxis(): Vec3Type { return this._connectedAxisVec; }
  set connectedAxis(v: Vec3Type) {
    Vec3.copy(this._connectedAxisVec, v);
    if (this.joint) this._recreateJoint();
  }

  get autoConfigureConnectedAxis(): boolean { return this._autoConfigureConnectedAxis; }
  set autoConfigureConnectedAxis(v: boolean) {
    this._autoConfigureConnectedAxis = v;
    if (v && this.joint) this._recreateJoint();
  }

  // --- Limit accessors (sync to live joint) --- //

  get limitsEnabled(): boolean { return this._limitsEnabled; }
  set limitsEnabled(v: boolean) { this._limitsEnabled = v; this._applyLimits(); }

  get limitMin(): number { return this._limitMin; }
  set limitMin(v: number) { this._limitMin = v; this._applyLimits(); }

  get limitMax(): number { return this._limitMax; }
  set limitMax(v: number) { this._limitMax = v; this._applyLimits(); }

  // --- Motor accessors (sync to live joint) --- //

  get motorEnabled(): boolean { return this._motorEnabled; }
  set motorEnabled(v: boolean) {
    const wasEnabled = this._motorEnabled;
    this._motorEnabled = v;
    if (v) {
      this._applyMotor();
    } else if (wasEnabled && this.joint) {
      // Calling configureMotorVelocity(0,0) still activates the motor solver and brakes
      // the joint. The only way to truly disable the motor is to recreate the joint.
      this._recreateJoint();
    }
  }

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
    if (options?.axis) this._setVec3(this._axis, options.axis);
    if (options?.connectedAxis) {
      this._setVec3(this._connectedAxisVec, options.connectedAxis);
      this._autoConfigureConnectedAxis = false;
    } else if (options?.axis && !this._autoConfigureConnectedAxis) {
      this._setVec3(this._connectedAxisVec, options.axis);
    }
    if (options?.autoConfigureConnectedAxis !== undefined) {
      this._autoConfigureConnectedAxis = options.autoConfigureConnectedAxis;
    }
    if (options?.limitsEnabled !== undefined) this._limitsEnabled = options.limitsEnabled;
    if (options?.limitMin !== undefined) this._limitMin = options.limitMin;
    if (options?.limitMax !== undefined) this._limitMax = options.limitMax;
    if (options?.motorEnabled !== undefined) this._motorEnabled = options.motorEnabled;
    if (options?.motorMode !== undefined) this._motorMode = options.motorMode;
    if (options?.motorTargetVelocity !== undefined) this._motorTargetVelocity = options.motorTargetVelocity;
    if (options?.motorMaxForce !== undefined) this._motorMaxForce = options.motorMaxForce;
    if (options?.motorTargetPosition !== undefined) this._motorTargetPosition = options.motorTargetPosition;
    if (options?.motorStiffness !== undefined) this._motorStiffness = options.motorStiffness;
    if (options?.motorDamping !== undefined) this._motorDamping = options.motorDamping;
    super.init(world, options);
  }

  override refreshAutoConfig(): void {
    super.refreshAutoConfig();
    if (this._autoConfigureConnectedAxis) {
      this._computeConnectedAxis();
    }
  }

  protected _tryCreateJoint(): void {
    if (this._autoConfigureConnectedAxis) {
      this._computeConnectedAxis();
    }
    super._tryCreateJoint();
    // The joint was created via JointData.fixed() + WASM locked_axes patch.
    // createImpulseJoint returns FixedImpulseJoint (based on JS-side type dispatch),
    // but the underlying WASM joint is revolute. Swap the prototype so setLimits/
    // configureMotor (on UnitImpulseJoint) and rawAxis() (on RevoluteImpulseJoint)
    // are available.
    if (this.joint) {
      Object.setPrototypeOf(this.joint, RAPIER.RevoluteImpulseJoint.prototype);
    }
    this._applyLimits();
    this._applyMotor();
  }

  private _computeConnectedAxis(): void {
    if (!this._connectedObject) return;
    const thisTransform = this.gameObject.transform;
    const otherTransform = this._connectedObject.transform;
    thisTransform.updateWorldMatrix();
    otherTransform.updateWorldMatrix();

    const ax = this._axis[0]!, ay = this._axis[1]!, az = this._axis[2]!;

    // Extract rotation columns from body A (normalize to remove scale)
    const m = thisTransform.worldMatrix;
    const sAx = Math.sqrt(m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!) || 1;
    const sAy = Math.sqrt(m[4]! * m[4]! + m[5]! * m[5]! + m[6]! * m[6]!) || 1;
    const sAz = Math.sqrt(m[8]! * m[8]! + m[9]! * m[9]! + m[10]! * m[10]!) || 1;

    // Transform axis direction: local A → world (rotation only, no scale)
    const wx = (m[0]! / sAx) * ax + (m[4]! / sAy) * ay + (m[8]! / sAz) * az;
    const wy = (m[1]! / sAx) * ax + (m[5]! / sAy) * ay + (m[9]! / sAz) * az;
    const wz = (m[2]! / sAx) * ax + (m[6]! / sAy) * ay + (m[10]! / sAz) * az;

    // Extract rotation columns from body B (normalize to remove scale)
    const n = otherTransform.worldMatrix;
    const sBx = Math.sqrt(n[0]! * n[0]! + n[1]! * n[1]! + n[2]! * n[2]!) || 1;
    const sBy = Math.sqrt(n[4]! * n[4]! + n[5]! * n[5]! + n[6]! * n[6]!) || 1;
    const sBz = Math.sqrt(n[8]! * n[8]! + n[9]! * n[9]! + n[10]! * n[10]!) || 1;

    // Transform world direction → local B using rotation transpose (no scale)
    const lx = (n[0]! / sBx) * wx + (n[1]! / sBx) * wy + (n[2]! / sBx) * wz;
    const ly = (n[4]! / sBy) * wx + (n[5]! / sBy) * wy + (n[6]! / sBy) * wz;
    const lz = (n[8]! / sBz) * wx + (n[9]! / sBz) * wy + (n[10]! / sBz) * wz;

    // Normalize
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (len > 1e-6) {
      Vec3.set(this._connectedAxisVec, lx / len, ly / len, lz / len);
    }
  }

  private _setVec3(target: Float32Array, src: AxisOption): void {
    if (src instanceof Float32Array) {
      Vec3.copy(target, src);
    } else {
      Vec3.set(target, src.x, src.y, src.z);
    }
  }

  private _applyLimits(): void {
    if (!this.joint) return;
    const revolute = this.joint as RAPIER.RevoluteImpulseJoint;
    if (this._limitsEnabled) {
      revolute.setLimits(this._limitMin, this._limitMax);
    } else {
      // Disable limits by setting full-range
      revolute.setLimits(-Math.PI, Math.PI);
    }
  }

  private _applyMotor(): void {
    if (!this.joint || !this._motorEnabled) return;
    const revolute = this.joint as RAPIER.RevoluteImpulseJoint;
    if (this._motorMode === 'velocity') {
      revolute.configureMotorVelocity(this._motorTargetVelocity, this._motorMaxForce);
    } else {
      revolute.configureMotorPosition(this._motorTargetPosition, this._motorStiffness, this._motorDamping);
    }
  }

  protected _createJointData(): RAPIER.JointData {
    // Normalize axes — Rapier rejects zero-length vectors
    const ax = this._axis[0]!, ay = this._axis[1]!, az = this._axis[2]!;
    const axisLen = Math.sqrt(ax * ax + ay * ay + az * az);
    if (axisLen < 1e-6) {
      throw new Error('HingeJoint axis is zero-length');
    }
    const nax = ax / axisLen, nay = ay / axisLen, naz = az / axisLen;

    const cax = this._connectedAxisVec[0]!, cay = this._connectedAxisVec[1]!, caz = this._connectedAxisVec[2]!;
    const caxisLen = Math.sqrt(cax * cax + cay * cay + caz * caz);
    if (caxisLen < 1e-6) {
      throw new Error('HingeJoint connectedAxis is zero-length');
    }
    const ncax = cax / caxisLen, ncay = cay / caxisLen, ncaz = caz / caxisLen;

    const frame1 = axisToFrame(nax, nay, naz);
    const frame2 = axisToFrame(ncax, ncay, ncaz);

    // Rapier 0.14's JS bindings ignore frame1/frame2 for revolute joints in intoRaw().
    // Workaround: create as a Fixed joint (which does support per-body frames),
    // then patch the locked_axes byte in WASM memory from Fixed (0x3F) to Revolute (0x37).
    const data = RAPIER.JointData.fixed(
      this._toXYZ(this.anchor),
      frame1,
      this._toXYZ(this.connectedAnchor),
      frame2,
    );

    const mem = getWasmMemory();
    const offset = getLockedAxesOffset();
    if (mem && offset >= 0) {
      const origIntoRaw = data.intoRaw.bind(data);
      data.intoRaw = () => {
        const raw = origIntoRaw();
        if (raw) {
          const ptr = (raw as unknown as { __wbg_ptr: number }).__wbg_ptr;
          const bytes = new Uint8Array(mem.buffer);
          bytes[ptr + offset] = 0x37; // Revolute: all DOFs locked except AngX
        }
        return raw;
      };
    }

    // Limits and motor are applied after creation via _applyLimits() / _applyMotor()
    return data;
  }
}
