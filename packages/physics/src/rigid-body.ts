import RAPIER from '@dimforge/rapier3d-compat';
import { Component } from '@atmos/core';
import type { PhysicsWorld } from './physics-world.js';

export type RigidBodyType = 'dynamic' | 'fixed' | 'kinematic';

export interface RigidBodyOptions {
  type?: RigidBodyType;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
}

// Scratch Rapier objects (reused to avoid GC pressure in hot paths)
const _rVec3 = new RAPIER.Vector3(0, 0, 0);
const _rQuat = new RAPIER.Quaternion(0, 0, 0, 1);
const _rZero = new RAPIER.Vector3(0, 0, 0);

export class RigidBody extends Component {
  body: RAPIER.RigidBody | null = null;
  bodyType: RigidBodyType = 'dynamic';

  private _world: PhysicsWorld | null = null;
  private _linearDamping = 0;
  private _angularDamping = 0;
  private _gravityScale = 1;

  /** When true, Transform is extrapolated between physics steps to reduce jitter. */
  interpolate = false;

  get linearDamping(): number { return this._linearDamping; }
  set linearDamping(v: number) {
    this._linearDamping = v;
    if (this.body) this.body.setLinearDamping(v);
  }

  get angularDamping(): number { return this._angularDamping; }
  set angularDamping(v: number) {
    this._angularDamping = v;
    if (this.body) this.body.setAngularDamping(v);
  }

  get gravityScale(): number { return this._gravityScale; }
  set gravityScale(v: number) {
    this._gravityScale = v;
    if (this.body) this.body.setGravityScale(v, true);
  }

  init(world: PhysicsWorld, options: RigidBodyOptions = {}): void {
    this._world = world;
    this.bodyType = options.type ?? 'dynamic';

    const t = this.gameObject.transform;
    const pos = t.position;
    const rot = t.rotation;

    let desc: RAPIER.RigidBodyDesc;
    switch (this.bodyType) {
      case 'dynamic':
        desc = RAPIER.RigidBodyDesc.dynamic();
        break;
      case 'fixed':
        desc = RAPIER.RigidBodyDesc.fixed();
        break;
      case 'kinematic':
        desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        break;
    }

    desc.setTranslation(pos[0]!, pos[1]!, pos[2]!);
    desc.setRotation({ x: rot[0]!, y: rot[1]!, z: rot[2]!, w: rot[3]! });

    if (options.linearDamping !== undefined) {
      this._linearDamping = options.linearDamping;
      desc.setLinearDamping(options.linearDamping);
    }
    if (options.angularDamping !== undefined) {
      this._angularDamping = options.angularDamping;
      desc.setAngularDamping(options.angularDamping);
    }
    if (options.gravityScale !== undefined) {
      this._gravityScale = options.gravityScale;
      desc.setGravityScale(options.gravityScale);
    }

    this.body = world.createRigidBody(desc);

    if (options.mass !== undefined && this.bodyType === 'dynamic') {
      this.body.setAdditionalMass(options.mass);
    }
  }

  /** Copy Rapier body transform → engine Transform (for dynamic bodies) */
  syncToTransform(): void {
    if (!this.body) return;
    const t = this.gameObject.transform;
    const pos = this.body.translation();
    t.setPosition(pos.x, pos.y, pos.z);

    const rot = this.body.rotation();
    t.setRotation(rot.x, rot.y, rot.z, rot.w);
  }

  /** Extrapolate Transform using Rapier body position + velocity * dt. */
  extrapolateTransform(dt: number): void {
    if (!this.body) return;
    const t = this.gameObject.transform;
    const pos = this.body.translation();
    const lv = this.body.linvel();
    t.setPosition(pos.x + lv.x * dt, pos.y + lv.y * dt, pos.z + lv.z * dt);

    const rot = this.body.rotation();
    const av = this.body.angvel();
    // Apply angular velocity as small rotation: q' = q + 0.5 * [av, 0] * q * dt
    const hdt = 0.5 * dt;
    const dqx = (av.x * rot.w + av.y * rot.z - av.z * rot.y) * hdt;
    const dqy = (-av.x * rot.z + av.y * rot.w + av.z * rot.x) * hdt;
    const dqz = (av.x * rot.y - av.y * rot.x + av.z * rot.w) * hdt;
    const dqw = (-av.x * rot.x - av.y * rot.y - av.z * rot.z) * hdt;
    let rx = rot.x + dqx;
    let ry = rot.y + dqy;
    let rz = rot.z + dqz;
    let rw = rot.w + dqw;
    // Renormalize
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
    if (len > 1e-8) {
      const inv = 1 / len;
      rx *= inv; ry *= inv; rz *= inv; rw *= inv;
    }
    t.setRotation(rx, ry, rz, rw);
  }

  /** Copy engine Transform → Rapier body (for kinematic bodies) */
  syncFromTransform(): void {
    if (!this.body) return;
    const pos = this.gameObject.transform.position;
    const rot = this.gameObject.transform.rotation;
    _rVec3.x = pos[0]!; _rVec3.y = pos[1]!; _rVec3.z = pos[2]!;
    this.body.setNextKinematicTranslation(_rVec3);
    _rQuat.x = rot[0]!; _rQuat.y = rot[1]!; _rQuat.z = rot[2]!; _rQuat.w = rot[3]!;
    this.body.setNextKinematicRotation(_rQuat);
  }

  /** Teleport Rapier body to match engine Transform (for external edits on dynamic bodies) */
  teleportToTransform(): void {
    if (!this.body) return;
    const pos = this.gameObject.transform.position;
    const rot = this.gameObject.transform.rotation;
    _rVec3.x = pos[0]!; _rVec3.y = pos[1]!; _rVec3.z = pos[2]!;
    this.body.setTranslation(_rVec3, true);
    _rQuat.x = rot[0]!; _rQuat.y = rot[1]!; _rQuat.z = rot[2]!; _rQuat.w = rot[3]!;
    this.body.setRotation(_rQuat, true);
    _rZero.x = 0; _rZero.y = 0; _rZero.z = 0;
    this.body.setLinvel(_rZero, true);
    this.body.setAngvel(_rZero, true);
    this.body.wakeUp();
  }

  addForce(x: number, y: number, z: number): void {
    if (!this.body) return;
    _rVec3.x = x; _rVec3.y = y; _rVec3.z = z;
    this.body.addForce(_rVec3, true);
  }

  addImpulse(x: number, y: number, z: number): void {
    if (!this.body) return;
    _rVec3.x = x; _rVec3.y = y; _rVec3.z = z;
    this.body.applyImpulse(_rVec3, true);
  }

  onDestroy(): void {
    if (this.body && this._world) {
      // Nullify descendant collider handles before body removal
      // (Rapier auto-removes attached colliders when a body is removed)
      this._invalidateChildColliders(this.gameObject);
      this._world.removeRigidBody(this.body);
      this.body = null;
    }
  }

  /** Walk descendants and null out collider handles that reference this body. */
  private _invalidateChildColliders(go: GameObject): void {
    for (const comp of go.getComponents()) {
      // Duck-type: any component with collider + attachedBody pointing to this RB
      const c = comp as Record<string, unknown>;
      if ('collider' in c && 'attachedBody' in c && c['attachedBody'] === this) {
        c['collider'] = null;
      }
    }
    for (const child of go.children) {
      this._invalidateChildColliders(child);
    }
  }
}
