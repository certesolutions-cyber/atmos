import RAPIER from '@dimforge/rapier3d-compat';
import { Component } from '@atmos/core';
import type { GameObject } from '@atmos/core';
import { Vec3, Mat4 } from '@atmos/math';
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

  readonly anchor: Float32Array = Vec3.create();
  readonly connectedAnchor: Float32Array = Vec3.create();
  autoConfigureConnectedAnchor = true;

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
      Vec3.set(this.anchor, options.anchor.x, options.anchor.y, options.anchor.z);
    }
    if (options?.connectedAnchor) {
      Vec3.set(
        this.connectedAnchor,
        options.connectedAnchor.x,
        options.connectedAnchor.y,
        options.connectedAnchor.z,
      );
    }
    if (options?.autoConfigureConnectedAnchor !== undefined) {
      this.autoConfigureConnectedAnchor = options.autoConfigureConnectedAnchor;
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

    if (this.autoConfigureConnectedAnchor) {
      this._computeConnectedAnchor();
    }

    const data = this._createJointData();
    this.joint = this._world.createJoint(data, rb.body, targetRb.body);
  }

  private _computeConnectedAnchor(): void {
    const thisTransform = this.gameObject.transform;
    const otherTransform = this._connectedObject!.transform;

    thisTransform.updateWorldMatrix();
    otherTransform.updateWorldMatrix();

    // Transform anchor from this body's local space → world space
    const m = thisTransform.worldMatrix;
    const ax = this.anchor[0]!, ay = this.anchor[1]!, az = this.anchor[2]!;
    const wx = m[0]! * ax + m[4]! * ay + m[8]! * az + m[12]!;
    const wy = m[1]! * ax + m[5]! * ay + m[9]! * az + m[13]!;
    const wz = m[2]! * ax + m[6]! * ay + m[10]! * az + m[14]!;

    // Transform world point → connected body's local space
    const inv = Mat4.create();
    Mat4.invert(inv, otherTransform.worldMatrix);
    const lx = inv[0]! * wx + inv[4]! * wy + inv[8]! * wz + inv[12]!;
    const ly = inv[1]! * wx + inv[5]! * wy + inv[9]! * wz + inv[13]!;
    const lz = inv[2]! * wx + inv[6]! * wy + inv[10]! * wz + inv[14]!;

    Vec3.set(this.connectedAnchor, lx, ly, lz);
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
