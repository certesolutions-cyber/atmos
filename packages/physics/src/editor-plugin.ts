import type { Component, GameObject, Scene, PhysicsStepper } from '@atmos/core';
import { applyComponentData, getAllRegisteredComponents } from '@atmos/core';
import { initRapier } from './init.js';
import { PhysicsWorld } from './physics-world.js';
import { PhysicsSystem } from './physics-system.js';
import { RigidBody } from './rigid-body.js';
import { Collider } from './collider.js';
import type { ColliderShape } from './collider.js';
import { Joint } from './joint.js';
import { registerPhysicsBuiltins } from './register-builtins.js';
import { findAncestorComponent, hasAncestorComponent, hasDescendantComponent } from './physics-hierarchy.js';

/** Minimal mesh interface for collider auto-sizing (structurally matches @atmos/editor MeshLike) */
interface MeshLike {
  vertices?: Float32Array;
  vertexStride?: number;
}

/** Matches @atmos/editor PhysicsInitContext structurally */
interface InitContext {
  meshes: Record<string, unknown>;
  getMesh(go: GameObject): MeshLike | null;
}

// Well-known collider shapes for built-in primitives
const PRIMITIVE_SHAPES: Record<string, ColliderShape> = {
  cube: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
  plane: { type: 'box', halfExtents: { x: 10, y: 0.01, z: 10 } },
  sphere: { type: 'sphere', radius: 0.5 },
  cylinder: { type: 'cylinder', halfHeight: 0.5, radius: 0.4 },
};

function extractPositions(verts: Float32Array, stride: number): Float32Array {
  const count = Math.floor(verts.length / stride);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const src = i * stride;
    const dst = i * 3;
    positions[dst] = verts[src]!;
    positions[dst + 1] = verts[src + 1]!;
    positions[dst + 2] = verts[src + 2]!;
  }
  return positions;
}

function colliderShapeForMesh(
  mesh: MeshLike,
  knownShapes: Map<unknown, ColliderShape>,
): ColliderShape {
  const known = knownShapes.get(mesh);
  if (known) return known;
  const verts = mesh.vertices;
  const stride = mesh.vertexStride ?? 8;
  if (!verts) return { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
  return { type: 'convexHull', vertices: extractPositions(verts, stride) };
}

/**
 * Walk descendants and re-attach any Collider that sits on its own standalone body
 * (i.e. auto-created when no ancestor RB existed). Removes the standalone RB first.
 */
function adoptDescendantColliders(go: GameObject, world: PhysicsWorld): void {
  for (const child of go.children) {
    const rb = child.getComponent(RigidBody);
    const col = child.getComponent(Collider);

    if (rb && col && !col.isChildCollider) {
      // Child has standalone RB + Collider — remove RB and re-attach as compound
      child.removeComponent(rb);
      col.reattach(world);
      // Continue into subtree since this RB was removed
      adoptDescendantColliders(child, world);
    } else if (!rb) {
      // No RB on this child — check deeper
      adoptDescendantColliders(child, world);
    }
    // If child has its own RB with a different compound setup, don't recurse past it
  }
}

export async function createEditorPhysics() {
  await initRapier();
  registerPhysicsBuiltins();

  const world = new PhysicsWorld({ fixedTimestep: 1 / 60, solverIterations: 8 });
  let meshShapes = new Map<unknown, ColliderShape>();
  let getMesh: (go: GameObject) => MeshLike | null = () => null;
  let system: PhysicsSystem | null = null;

  function getShape(go: GameObject): ColliderShape {
    const m = getMesh(go);
    return m ? colliderShapeForMesh(m, meshShapes) : { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
  }

  return {
    init(ctx: InitContext) {
      getMesh = ctx.getMesh;
      meshShapes = new Map();
      for (const [name, mesh] of Object.entries(ctx.meshes)) {
        const shape = PRIMITIVE_SHAPES[name];
        if (shape) meshShapes.set(mesh, shape);
      }
    },

    createStepper(scene: Scene): PhysicsStepper & { scene: Scene } {
      system = new PhysicsSystem(world, scene);
      return system;
    },

    canAddComponent(ctor: new () => Component, go: GameObject): string | null {
      if (ctor === (RigidBody as unknown)) {
        if (go.getComponent(RigidBody)) return 'Already has a RigidBody';
        if (hasAncestorComponent(go, RigidBody)) return 'Ancestor already has a RigidBody';
      }
      return null;
    },

    handleAddComponent(ctor: new () => Component, go: GameObject): boolean {
      if (ctor === (RigidBody as unknown)) {
        if (hasAncestorComponent(go, RigidBody)) {
          console.warn('Cannot add RigidBody: ancestor already has one.');
          return true;
        }
        const rb = go.addComponent(RigidBody);
        rb.init(world, { type: 'dynamic' });
        if (!go.getComponent(Collider)) {
          const col = go.addComponent(Collider);
          col.init(world, { shape: getShape(go), friction: 0.3, restitution: 0.3 });
        }
        // Adopt descendant colliders that are on standalone auto-created bodies
        adoptDescendantColliders(go, world);
        return true;
      }
      if (ctor === (Collider as unknown)) {
        if (!findAncestorComponent(go, RigidBody)) {
          const rb = go.addComponent(RigidBody);
          rb.init(world, { type: 'fixed' });
        }
        const col = go.addComponent(Collider);
        col.init(world, { shape: getShape(go), friction: 0.3, restitution: 0.3 });
        return true;
      }
      if (ctor.prototype instanceof Joint) {
        let rb = go.getComponent(RigidBody);
        if (!rb) {
          rb = go.addComponent(RigidBody);
          rb.init(world, { type: 'dynamic' });
        }
        if (!go.getComponent(Collider)) {
          const col = go.addComponent(Collider);
          col.init(world, { shape: getShape(go), friction: 0.3, restitution: 0.3 });
        }
        const joint = go.addComponent(ctor) as Joint;
        joint.init(world);
        return true;
      }
      return false;
    },

    handleRemoveComponent(comp: Component, go: GameObject): boolean {
      if (comp instanceof RigidBody) {
        // Collect colliders attached to this body before destroying it
        const rb = comp;
        const orphans: Collider[] = [];
        const collect = (obj: GameObject) => {
          const col = obj.getComponent(Collider);
          if (col && col.attachedBody === rb) orphans.push(col);
          for (const child of obj.children) collect(child);
        };
        collect(go);

        go.removeComponent(rb);

        // Re-attach orphaned colliders to an ancestor body if available
        for (const col of orphans) {
          if (findAncestorComponent(col.gameObject, RigidBody)) {
            col.reattach(world);
          }
        }
        return true;
      }
      return false;
    },

    handleDeserialize(
      go: GameObject, type: string, data: Record<string, unknown>,
      deferred: Array<() => void>,
    ): boolean {
      if (type === 'RigidBody') {
        const rb = go.addComponent(RigidBody);
        rb.init(world, { type: (data['bodyType'] as 'dynamic' | 'fixed' | 'kinematic') ?? 'dynamic' });
        return true;
      }
      if (type === 'Collider') {
        if (!go.getComponent(RigidBody)) {
          const rb = go.addComponent(RigidBody);
          rb.init(world, { type: 'fixed' });
        }
        const col = go.addComponent(Collider);
        col.init(world, { shape: getShape(go), friction: 0.3, restitution: 0.3 });
        return true;
      }
      // Check for Joint subclasses
      const allComps = getAllRegisteredComponents();
      for (const [ctor, def] of allComps) {
        if (def.name === type && ctor.prototype instanceof Joint) {
          if (!go.getComponent(RigidBody)) {
            const rb = go.addComponent(RigidBody);
            rb.init(world, { type: 'dynamic' });
          }
          if (!go.getComponent(Collider)) {
            const col = go.addComponent(Collider);
            col.init(world, { shape: getShape(go), friction: 0.3, restitution: 0.3 });
          }
          const joint = go.addComponent(ctor as new () => Joint) as Joint;
          joint.init(world);
          const connObj = data['connectedObject'];
          delete data['connectedObject'];
          applyComponentData(joint, data);
          if (connObj) {
            deferred.push(() => { joint.connectedObject = connObj as GameObject; });
          }
          return true;
        }
      }
      return false;
    },

    flushDeferred(ops: Array<() => void>) {
      for (const fn of ops) fn();
      ops.length = 0;
    },

    installReparentHooks(
      setValidator: (fn: ((child: GameObject, newParent: GameObject | null) => boolean) | null) => void,
      setCallback: (fn: ((child: GameObject) => void) | null) => void,
    ) {
      setValidator((child: GameObject, newParent: GameObject | null) => {
        if (!newParent) return true;
        const childHasRb = !!child.getComponent(RigidBody);
        const parentHasRb = !!newParent.getComponent(RigidBody) || hasAncestorComponent(newParent, RigidBody);
        if (childHasRb && parentHasRb) return false;
        if (parentHasRb && hasDescendantComponent(child, RigidBody)) return false;
        return true;
      });

      setCallback((child: GameObject) => {
        const reattachSubtree = (go: GameObject) => {
          const col = go.getComponent(Collider);
          if (col && col.collider) col.reattach(world);
          for (const c of go.children) reattachSubtree(c);
        };
        reattachSubtree(child);
      });
    },

    onSceneChanged(scene: Scene) {
      if (system) system.scene = scene;
    },

    onSceneRestored(scene: Scene) {
      for (const go of scene.getAllObjects()) {
        const rb = go.getComponent(RigidBody);
        if (rb) rb.teleportToTransform();
      }
    },
  };
}
