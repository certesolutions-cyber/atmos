import RAPIER from '@dimforge/rapier3d-compat';
import { Component } from '@atmos/core';
import type { GameObject } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import type { PhysicsWorld } from './physics-world.js';
import { RigidBody } from './rigid-body.js';

export interface JointOptions {
  connectedObject?: GameObject;
  anchor?: { x: number; y: number; z: number };
  connectedAnchor?: { x: number; y: number; z: number };
  autoConfigureConnectedAnchor?: boolean;
}

/** Scratch buffer for inverse world matrix (reused, never escapes). */
const _invWorld = new Float32Array(16);

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

    const data = this._createJointData();
    this.joint = this._world.createJoint(data, rb.body, targetRb.body);
  }

  /** Destroy current joint and recreate it (used when creation-time params change). */
  protected _recreateJoint(): void {
    if (!this.joint) return;
    this._removeJoint();
    this._tryCreateJoint();
  }

  private _computeConnectedAnchor(): void {
    const thisTransform = this.gameObject.transform;
    const otherTransform = this._connectedObject!.transform;

    thisTransform.updateWorldMatrix();
    otherTransform.updateWorldMatrix();

    // Transform anchor from this body's local space → world space
    const m = thisTransform.worldMatrix;
    const ax = this._anchor[0]!, ay = this._anchor[1]!, az = this._anchor[2]!;
    const wx = m[0]! * ax + m[4]! * ay + m[8]! * az + m[12]!;
    const wy = m[1]! * ax + m[5]! * ay + m[9]! * az + m[13]!;
    const wz = m[2]! * ax + m[6]! * ay + m[10]! * az + m[14]!;

    // Transform world point → connected body's local space
    // Full inverse is needed here because translation is involved
    invert4x4(_invWorld, otherTransform.worldMatrix);
    const lx = _invWorld[0]! * wx + _invWorld[4]! * wy + _invWorld[8]! * wz + _invWorld[12]!;
    const ly = _invWorld[1]! * wx + _invWorld[5]! * wy + _invWorld[9]! * wz + _invWorld[13]!;
    const lz = _invWorld[2]! * wx + _invWorld[6]! * wy + _invWorld[10]! * wz + _invWorld[14]!;

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

/**
 * In-place 4x4 matrix inverse using the scratch buffer `out`.
 * Avoids importing Mat4 (which would pull in the full math package for one op).
 */
function invert4x4(out: Float32Array, m: Float32Array): void {
  const a00 = m[0]!, a01 = m[1]!, a02 = m[2]!, a03 = m[3]!;
  const a10 = m[4]!, a11 = m[5]!, a12 = m[6]!, a13 = m[7]!;
  const a20 = m[8]!, a21 = m[9]!, a22 = m[10]!, a23 = m[11]!;
  const a30 = m[12]!, a31 = m[13]!, a32 = m[14]!, a33 = m[15]!;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-10) { out.fill(0); return; }
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}
