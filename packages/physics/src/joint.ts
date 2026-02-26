import RAPIER from '@dimforge/rapier3d-compat';
import { Component } from '@certe/atmos-core';
import type { GameObject } from '@certe/atmos-core';
import { Vec3 } from '@certe/atmos-math';
import type { PhysicsWorld } from './physics-world.js';
import { RigidBody } from './rigid-body.js';

export interface JointOptions {
  connectedObject?: GameObject;
  anchor?: { x: number; y: number; z: number };
  connectedAnchor?: { x: number; y: number; z: number };
  autoConfigureConnectedAnchor?: boolean;
}

export abstract class Joint extends Component {
  joint: RAPIER.ImpulseJoint | null = null;

  protected _connectedObject: GameObject | null = null;
  protected _world: PhysicsWorld | null = null;

  private readonly _anchor: Float32Array = Vec3.create();
  private readonly _connectedAnchor: Float32Array = Vec3.create();
  private _autoConfigureConnectedAnchor = true;

  get anchor(): Float32Array { return this._anchor; }
  set anchor(v: Float32Array) {
    Vec3.copy(this._anchor, v);
    this._recreateJoint();
  }

  get connectedAnchor(): Float32Array { return this._connectedAnchor; }
  set connectedAnchor(v: Float32Array) {
    Vec3.copy(this._connectedAnchor, v);
    this._recreateJoint();
  }

  get autoConfigureConnectedAnchor(): boolean { return this._autoConfigureConnectedAnchor; }
  set autoConfigureConnectedAnchor(v: boolean) {
    this._autoConfigureConnectedAnchor = v;
    if (v) this._recreateJoint();
  }

  get connectedObject(): GameObject | null {
    return this._connectedObject;
  }

  set connectedObject(value: GameObject | null) {
    if (this._connectedObject === value) return;
    this._removeJoint();
    this._connectedObject = value;
    this._tryCreateJoint();
  }

  init(world: PhysicsWorld, options?: JointOptions): void {
    this._world = world;
    if (options?.anchor) {
      Vec3.set(this._anchor, options.anchor.x, options.anchor.y, options.anchor.z);
    }
    if (options?.connectedAnchor) {
      Vec3.set(
        this._connectedAnchor,
        options.connectedAnchor.x,
        options.connectedAnchor.y,
        options.connectedAnchor.z,
      );
    }
    if (options?.autoConfigureConnectedAnchor !== undefined) {
      this._autoConfigureConnectedAnchor = options.autoConfigureConnectedAnchor;
    }
    if (options?.connectedObject) {
      this._connectedObject = options.connectedObject;
      this._tryCreateJoint();
    }
  }

  protected abstract _createJointData(): RAPIER.JointData;

  protected _toXYZ(v: Float32Array): { x: number; y: number; z: number } {
    return { x: v[0]!, y: v[1]!, z: v[2]! };
  }

  protected _tryCreateJoint(): void {
    if (!this._world || !this._connectedObject) return;

    const rb = this.gameObject.getComponent(RigidBody);
    if (!rb?.body) return;

    const targetRb = this._connectedObject.getComponent(RigidBody);
    if (!targetRb?.body) return;

    if (this._autoConfigureConnectedAnchor) {
      this._computeConnectedAnchor();
    }

    let data: RAPIER.JointData;
    try {
      data = this._createJointData();
    } catch {
      return; // invalid parameters (e.g. zero-length axis) — skip creation
    }
    this.joint = this._world.createJoint(data, rb.body, targetRb.body);
  }

  /** Destroy current joint and recreate it (used when creation-time params change). */
  protected _recreateJoint(): void {
    if (!this.joint) return;
    this._removeJoint();
    this._tryCreateJoint();
  }

  /** Recompute auto-configured values (anchor/axis) without recreating the Rapier joint. */
  refreshAutoConfig(): void {
    if (this._autoConfigureConnectedAnchor) {
      this._computeConnectedAnchor();
    }
  }

  /** Recreate the joint so auto-configured anchors/axes update after transforms change. */
  syncAutoConfig(): void {
    if (!this.joint) return;
    this._recreateJoint();
  }

  private _computeConnectedAnchor(): void {
    const thisTransform = this.gameObject.transform;
    const otherTransform = this._connectedObject!.transform;

    thisTransform.updateWorldMatrix();
    otherTransform.updateWorldMatrix();

    // Rapier joints use body-local space = position + rotation only (no scale).
    // Extract rotation (scale-free) from world matrices to match Rapier's interpretation.

    const mA = thisTransform.worldMatrix;
    const ax = this._anchor[0]!, ay = this._anchor[1]!, az = this._anchor[2]!;

    // Extract rotation columns from body A (normalize to remove scale)
    const sAx = Math.sqrt(mA[0]! * mA[0]! + mA[1]! * mA[1]! + mA[2]! * mA[2]!) || 1;
    const sAy = Math.sqrt(mA[4]! * mA[4]! + mA[5]! * mA[5]! + mA[6]! * mA[6]!) || 1;
    const sAz = Math.sqrt(mA[8]! * mA[8]! + mA[9]! * mA[9]! + mA[10]! * mA[10]!) || 1;
    const rA00 = mA[0]! / sAx, rA10 = mA[1]! / sAx, rA20 = mA[2]! / sAx;
    const rA01 = mA[4]! / sAy, rA11 = mA[5]! / sAy, rA21 = mA[6]! / sAy;
    const rA02 = mA[8]! / sAz, rA12 = mA[9]! / sAz, rA22 = mA[10]! / sAz;

    // World anchor = posA + rotA * anchor (no scale)
    const wx = mA[12]! + rA00 * ax + rA01 * ay + rA02 * az;
    const wy = mA[13]! + rA10 * ax + rA11 * ay + rA12 * az;
    const wz = mA[14]! + rA20 * ax + rA21 * ay + rA22 * az;

    // Extract rotation columns from body B (normalize to remove scale)
    const mB = otherTransform.worldMatrix;
    const sBx = Math.sqrt(mB[0]! * mB[0]! + mB[1]! * mB[1]! + mB[2]! * mB[2]!) || 1;
    const sBy = Math.sqrt(mB[4]! * mB[4]! + mB[5]! * mB[5]! + mB[6]! * mB[6]!) || 1;
    const sBz = Math.sqrt(mB[8]! * mB[8]! + mB[9]! * mB[9]! + mB[10]! * mB[10]!) || 1;
    const rB00 = mB[0]! / sBx, rB10 = mB[1]! / sBx, rB20 = mB[2]! / sBx;
    const rB01 = mB[4]! / sBy, rB11 = mB[5]! / sBy, rB21 = mB[6]! / sBy;
    const rB02 = mB[8]! / sBz, rB12 = mB[9]! / sBz, rB22 = mB[10]! / sBz;

    // connectedAnchor = inverse(rotB) * (worldAnchor - posB)
    // For a rotation matrix, inverse = transpose
    const dx = wx - mB[12]!, dy = wy - mB[13]!, dz = wz - mB[14]!;
    const lx = rB00 * dx + rB10 * dy + rB20 * dz;
    const ly = rB01 * dx + rB11 * dy + rB21 * dz;
    const lz = rB02 * dx + rB12 * dy + rB22 * dz;

    Vec3.set(this._connectedAnchor, lx, ly, lz);
  }

  protected _removeJoint(): void {
    if (this.joint && this._world) {
      this._world.removeJoint(this.joint);
      this.joint = null;
    }
  }

  onDestroy(): void {
    this._removeJoint();
    this._connectedObject = null;
  }
}
