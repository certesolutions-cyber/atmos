import RAPIER from '@dimforge/rapier3d-compat';
import { Component } from '@certe/atmos-core';
import type { GameObject } from '@certe/atmos-core';
import type { PhysicsWorld } from './physics-world.js';
import { RigidBody } from './rigid-body.js';
import { findAncestorComponent } from './physics-hierarchy.js';
import { computeColliderOffset } from './collider-offset.js';

export type ColliderShape =
  | { type: 'box'; halfExtents: { x: number; y: number; z: number }; center?: { x: number; y: number; z: number } }
  | { type: 'sphere'; radius: number }
  | { type: 'capsule'; halfHeight: number; radius: number }
  | { type: 'cylinder'; halfHeight: number; radius: number }
  | { type: 'convexHull'; vertices: Float32Array };

export interface ColliderOptions {
  shape: ColliderShape;
  friction?: number;
  restitution?: number;
  density?: number;
  isSensor?: boolean;
}

// Scratch vectors reused to avoid allocations
const _scaleVec = new RAPIER.Vector3(0, 0, 0);
const _offsetVec = new RAPIER.Vector3(0, 0, 0);
const _offsetRot = new RAPIER.Quaternion(0, 0, 0, 1);

export class Collider extends Component {
  collider: RAPIER.Collider | null = null;

  /** Unscaled base shape dimensions, stored at init time */
  private _baseShape: ColliderShape | null = null;
  private _options: ColliderOptions | null = null;
  private _world: PhysicsWorld | null = null;
  /** The RigidBody this collider is attached to (may be on an ancestor) */
  private _bodyRb: RigidBody | null = null;
  /** The GameObject that owns the RigidBody */
  private _bodyGo: GameObject | null = null;

  private _friction = 0.5;
  private _restitution = 0;
  private _density = 1;
  private _isSensor = false;

  get friction(): number { return this._friction; }
  set friction(v: number) {
    this._friction = v;
    if (this.collider) this.collider.setFriction(v);
  }

  get restitution(): number { return this._restitution; }
  set restitution(v: number) {
    this._restitution = v;
    if (this.collider) this.collider.setRestitution(v);
  }

  get density(): number { return this._density; }
  set density(v: number) {
    this._density = v;
    if (this.collider) this.collider.setDensity(v);
  }

  get isSensor(): boolean { return this._isSensor; }
  set isSensor(v: boolean) {
    this._isSensor = v;
    if (this.collider) this.collider.setSensor(v);
  }

  get attachedBody(): RigidBody | null {
    return this._bodyRb;
  }

  get shape(): ColliderShape | null {
    return this._baseShape;
  }

  get isChildCollider(): boolean {
    return this._bodyGo !== null && this._bodyGo !== this.gameObject;
  }

  init(world: PhysicsWorld, options: ColliderOptions): void {
    this._world = world;
    this._baseShape = options.shape;
    this._options = options;
    if (options.friction !== undefined) this._friction = options.friction;
    if (options.restitution !== undefined) this._restitution = options.restitution;
    if (options.density !== undefined) this._density = options.density;
    if (options.isSensor !== undefined) this._isSensor = options.isSensor;

    // Find body: self first, then walk up hierarchy
    const rb = findAncestorComponent(this.gameObject, RigidBody);
    if (!rb || !rb.body) {
      throw new Error(
        'Collider requires a RigidBody on this GameObject or an ancestor',
      );
    }

    this._bodyRb = rb;
    this._bodyGo = rb.gameObject;

    const desc = this._createDesc(options);

    // If attached to an ancestor's body, compute offset from hierarchy transforms
    if (this._bodyGo !== this.gameObject) {
      this._bodyGo.transform.updateWorldMatrix();
      this.gameObject.transform.updateWorldMatrix();
      const offset = computeColliderOffset(this._bodyGo, this.gameObject);
      desc.setTranslation(offset.tx, offset.ty, offset.tz);
      desc.setRotation({ x: offset.rx, y: offset.ry, z: offset.rz, w: offset.rw });
    }

    this.collider = world.createCollider(desc, rb.body);

    // Apply scale: use accumulated scale for child colliders, local for self
    if (this._bodyGo !== this.gameObject) {
      const offset = computeColliderOffset(this._bodyGo, this.gameObject);
      this.applyScale(offset.sx, offset.sy, offset.sz);
    } else {
      const scale = this.gameObject.transform.scale;
      if (scale[0] !== 1 || scale[1] !== 1 || scale[2] !== 1) {
        this.applyScale(scale[0]!, scale[1]!, scale[2]!);
      } else {
        this._applyCenterOffset();
      }
    }

    rb.body.wakeUp();
  }

  /** Recompute this child collider's offset from the current transform hierarchy. */
  syncOffset(): void {
    if (!this.collider || !this._bodyGo || this._bodyGo === this.gameObject) return;
    this._bodyGo.transform.updateWorldMatrix();
    this.gameObject.transform.updateWorldMatrix();
    const offset = computeColliderOffset(this._bodyGo, this.gameObject);
    _offsetVec.x = offset.tx; _offsetVec.y = offset.ty; _offsetVec.z = offset.tz;
    this.collider.setTranslationWrtParent(_offsetVec);
    _offsetRot.x = offset.rx; _offsetRot.y = offset.ry;
    _offsetRot.z = offset.rz; _offsetRot.w = offset.rw;
    this.collider.setRotationWrtParent(_offsetRot);
    this.applyScale(offset.sx, offset.sy, offset.sz);
  }

  /** Destroy and re-create the collider (e.g. after reparenting). */
  reattach(world: PhysicsWorld): void {
    if (!this._options) return;
    if (this.collider && this._world) {
      try { this._world.removeCollider(this.collider); } catch { /* already removed */ }
      this.collider = null;
    }
    this._bodyRb = null;
    this._bodyGo = null;
    this.init(world, this._options);
  }

  applyScale(sx: number, sy: number, sz: number): void {
    if (!this.collider || !this._baseShape) return;

    switch (this._baseShape.type) {
      case 'box': {
        const h = this._baseShape.halfExtents;
        _scaleVec.x = h.x * Math.abs(sx);
        _scaleVec.y = h.y * Math.abs(sy);
        _scaleVec.z = h.z * Math.abs(sz);
        this.collider.setHalfExtents(_scaleVec);
        break;
      }
      case 'sphere':
        this.collider.setRadius(
          this._baseShape.radius * Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)),
        );
        break;
      case 'cylinder':
        this.collider.setHalfHeight(this._baseShape.halfHeight * Math.abs(sy));
        this.collider.setRadius(
          this._baseShape.radius * Math.max(Math.abs(sx), Math.abs(sz)),
        );
        break;
      case 'capsule':
        this.collider.setHalfHeight(this._baseShape.halfHeight * Math.abs(sy));
        this.collider.setRadius(
          this._baseShape.radius * Math.max(Math.abs(sx), Math.abs(sz)),
        );
        break;
    }
    this._applyCenterOffset(sx, sy, sz);
  }

  /** Apply shape center offset (scaled), e.g. for plane collider where top face = visual surface. */
  private _applyCenterOffset(sx = 1, sy = 1, sz = 1): void {
    if (!this.collider || !this._baseShape || this._baseShape.type !== 'box') return;
    const c = this._baseShape.center;
    if (!c) return;
    // Only apply for self-colliders (not child colliders, which use hierarchy offset)
    if (this._bodyGo && this._bodyGo !== this.gameObject) return;
    _offsetVec.x = c.x * sx;
    _offsetVec.y = c.y * sy;
    _offsetVec.z = c.z * sz;
    this.collider.setTranslationWrtParent(_offsetVec);
  }

  onDestroy(): void {
    if (this.collider && this._world) {
      try { this._world.removeCollider(this.collider); } catch { /* stale handle */ }
      this.collider = null;
    }
    this._bodyRb = null;
    this._bodyGo = null;
  }

  private _createDesc(options: ColliderOptions): RAPIER.ColliderDesc {
    let desc: RAPIER.ColliderDesc;
    switch (options.shape.type) {
      case 'box': {
        const h = options.shape.halfExtents;
        desc = RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z);
        break;
      }
      case 'sphere':
        desc = RAPIER.ColliderDesc.ball(options.shape.radius);
        break;
      case 'capsule':
        desc = RAPIER.ColliderDesc.capsule(options.shape.halfHeight, options.shape.radius);
        break;
      case 'cylinder':
        desc = RAPIER.ColliderDesc.cylinder(options.shape.halfHeight, options.shape.radius);
        break;
      case 'convexHull': {
        const hull = RAPIER.ColliderDesc.convexHull(options.shape.vertices);
        if (!hull) throw new Error('Failed to compute convex hull from vertices');
        desc = hull;
        break;
      }
    }
    if (options.friction !== undefined) desc.setFriction(options.friction);
    if (options.restitution !== undefined) desc.setRestitution(options.restitution);
    if (options.density !== undefined) desc.setDensity(options.density);
    if (options.isSensor) desc.setSensor(true);
    return desc;
  }
}
