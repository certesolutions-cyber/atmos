import type { Scene, PhysicsStepper } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import type { PhysicsWorld } from './physics-world.js';
import { RigidBody } from './rigid-body.js';
import { Collider } from './collider.js';

export class PhysicsSystem implements PhysicsStepper {
  private readonly _world: PhysicsWorld;
  private _scene: Scene;
  /** Cached previous scale per GameObject id to detect changes */
  private readonly _prevScales = new Map<number, Float32Array>();
  /** Cached previous position for fixed bodies (avoids WASM FFI when unchanged) */
  private readonly _prevFixedPos = new Map<number, Float32Array>();
  /** Cached previous local transform (pos3+rot4+scale3) for child collider GOs */
  private readonly _prevChildTransforms = new Map<number, Float32Array>();

  constructor(world: PhysicsWorld, scene: Scene) {
    this._world = world;
    this._scene = scene;
  }

  set scene(s: Scene) {
    this._scene = s;
    this._prevScales.clear();
    this._prevFixedPos.clear();
    this._prevChildTransforms.clear();
  }

  step(dt: number): void {
    // Pre-step: push transforms into Rapier + detect changes
    for (const obj of this._scene.getAllObjects()) {
      const rb = obj.getComponent(RigidBody);

      if (rb && rb.enabled && rb.body) {
        // --- Scale change detection (all body types) ---
        const scale = obj.transform.scale;
        const prev = this._prevScales.get(obj.id);
        if (!prev) {
          this._prevScales.set(obj.id, new Float32Array([scale[0]!, scale[1]!, scale[2]!]));
        } else if (prev[0] !== scale[0] || prev[1] !== scale[1] || prev[2] !== scale[2]) {
          const col = obj.getComponent(Collider);
          if (col) {
            col.applyScale(scale[0]!, scale[1]!, scale[2]!);
          }
          Vec3.set(prev as Vec3.Vec3Type, scale[0]!, scale[1]!, scale[2]!);
        }

        // --- Position / rotation sync ---
        if (rb.bodyType === 'kinematic') {
          rb.syncFromTransform();
        } else if (rb.bodyType === 'dynamic') {
          // Dynamic bodies are moved by Rapier — compare against WASM body pos
          const pos = obj.transform.position;
          const bpos = rb.body.translation();
          const dx = pos[0]! - bpos.x;
          const dy = pos[1]! - bpos.y;
          const dz = pos[2]! - bpos.z;
          if (dx * dx + dy * dy + dz * dz > 1e-6) {
            rb.teleportToTransform();
          }
        } else if (rb.bodyType === 'fixed') {
          // Fixed bodies only change via editor — compare against JS-side cache
          const pos = obj.transform.position;
          const prev = this._prevFixedPos.get(obj.id);
          if (!prev) {
            this._prevFixedPos.set(obj.id, new Float32Array([pos[0]!, pos[1]!, pos[2]!]));
            rb.teleportToTransform();
          } else if (prev[0] !== pos[0] || prev[1] !== pos[1] || prev[2] !== pos[2]) {
            rb.teleportToTransform();
            Vec3.set(prev as Vec3.Vec3Type, pos[0]!, pos[1]!, pos[2]!);
          }
        }
      }

      // --- Child collider offset sync ---
      const col = obj.getComponent(Collider);
      if (col && col.enabled && col.isChildCollider && col.collider) {
        this._syncChildColliderOffset(obj, col);
      }
    }

    // Step physics world (fixed timestep accumulator)
    this._world.step(dt);

    // Post-step: pull dynamic body transforms back
    for (const obj of this._scene.getAllObjects()) {
      const rb = obj.getComponent(RigidBody);
      if (!rb || !rb.enabled || !rb.body) continue;
      if (rb.bodyType === 'dynamic') {
        rb.syncToTransform();
      }
    }
  }

  private _syncChildColliderOffset(obj: { id: number; transform: { position: Float32Array; rotation: Float32Array; scale: Float32Array } }, col: Collider): void {
    const pos = obj.transform.position;
    const rot = obj.transform.rotation;
    const scale = obj.transform.scale;

    const prev = this._prevChildTransforms.get(obj.id);
    if (!prev) {
      const data = new Float32Array(10);
      data.set(pos, 0);
      data.set(rot, 3);
      data.set(scale, 7);
      this._prevChildTransforms.set(obj.id, data);
      return;
    }

    let changed = false;
    for (let i = 0; i < 3 && !changed; i++) {
      if (prev[i] !== pos[i]) changed = true;
    }
    for (let i = 0; i < 4 && !changed; i++) {
      if (prev[3 + i] !== rot[i]) changed = true;
    }
    for (let i = 0; i < 3 && !changed; i++) {
      if (prev[7 + i] !== scale[i]) changed = true;
    }

    if (changed) {
      col.syncOffset();
      prev.set(pos, 0);
      prev.set(rot, 3);
      prev.set(scale, 7);
    }
  }
}
