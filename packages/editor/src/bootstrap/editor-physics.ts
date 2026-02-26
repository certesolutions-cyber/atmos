import type { Component, GameObject, Scene, PhysicsStepper } from '@atmos/core';
import { applyComponentData, getAllRegisteredComponents } from '@atmos/core';
import {
  initRapier,
  PhysicsWorld,
  PhysicsSystem,
  RigidBody,
  Collider,
  Joint,
  HingeJoint,
  registerPhysicsBuiltins,
  findAncestorComponent,
  hasAncestorComponent,
  hasDescendantComponent,
} from '@atmos/physics';
import type { ColliderShape } from '@atmos/physics';

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
  cylinder: { type: 'cylinder', halfHeight: 0.5, radius: 0.5 },
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

    handleDuplicate(copy: GameObject, source: GameObject): void {
      const srcRb = source.getComponent(RigidBody);
      const srcCol = source.getComponent(Collider);

      // Initialize RigidBody first (Collider depends on it)
      if (srcRb) {
        const rb = copy.getComponent(RigidBody);
        if (rb && !rb.body) {
          rb.init(world, {
            type: rb.bodyType || srcRb.bodyType,
            linearDamping: srcRb.linearDamping,
            angularDamping: srcRb.angularDamping,
            gravityScale: srcRb.gravityScale,
          });
        }
      }

      // Initialize Collider
      if (srcCol && srcCol.shape) {
        const col = copy.getComponent(Collider);
        if (col && !col.collider) {
          // Ensure ancestor RigidBody exists (may be on parent)
          if (!findAncestorComponent(copy, RigidBody)) {
            const rb = copy.addComponent(RigidBody);
            rb.init(world, { type: 'fixed' });
          }
          col.init(world, {
            shape: srcCol.shape,
            friction: srcCol.friction,
            restitution: srcCol.restitution,
            density: srcCol.density,
            isSensor: srcCol.isSensor,
          });
        }
      }

      // Initialize Joints
      for (const comp of copy.getComponents()) {
        if (comp instanceof Joint && !comp.joint) {
          comp.init(world);
        }
      }
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
        applyComponentData(rb, data);
        return true;
      }
      if (type === 'Collider') {
        if (!go.getComponent(RigidBody)) {
          const rb = go.addComponent(RigidBody);
          rb.init(world, { type: 'fixed' });
        }
        const col = go.addComponent(Collider);
        col.init(world, { shape: getShape(go), friction: 0.3, restitution: 0.3 });
        applyComponentData(col, data);
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

    isPhysicsComponent(comp: Component): boolean {
      return comp instanceof RigidBody || comp instanceof Collider || comp instanceof Joint;
    },

    onSceneRestored(scene: Scene) {
      world.resetAccumulator();
      for (const go of scene.getAllObjects()) {
        const rb = go.getComponent(RigidBody);
        if (rb) rb.teleportToTransform();
      }
    },

    syncTransformsForObjects(objects: readonly GameObject[]) {
      for (const go of objects) {
        const rb = go.getComponent(RigidBody);
        if (!rb || !rb.body) continue;
        // Sync collider scale
        const col = go.getComponent(Collider);
        if (col) {
          const scale = go.transform.scale;
          col.applyScale(scale[0]!, scale[1]!, scale[2]!);
        }
        // Sync fixed body position
        if (rb.bodyType === 'fixed') {
          rb.teleportToTransform();
        }
      }
    },

    syncJointsForObjects(objects: readonly GameObject[]) {
      const scene = system?.scene;
      if (!scene) return;

      // Collect all joints that reference any of the moved objects (as owner or connectedObject)
      const moved = new Set(objects);

      for (const go of scene.getAllObjects()) {
        for (const comp of go.getComponents()) {
          if (!(comp instanceof Joint)) continue;
          if (moved.has(go) || (comp.connectedObject && moved.has(comp.connectedObject))) {
            comp.refreshAutoConfig();
          }
        }
      }
    },

    syncAllJoints(scene: Scene) {
      for (const go of scene.getAllObjects()) {
        for (const comp of go.getComponents()) {
          if (comp instanceof Joint) comp.syncAutoConfig();
        }
      }
    },

    getColliderGizmoData(go: GameObject) {
      const results: Array<{
        shapeType: 'box' | 'sphere' | 'capsule' | 'cylinder';
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number; w: number };
        halfExtents?: { x: number; y: number; z: number };
        radius?: number;
        halfHeight?: number;
      }> = [];

      const collectCollider = (obj: GameObject) => {
        const col = obj.getComponent(Collider);
        if (!col || !col.collider || !col.shape) return;
        const shape = col.shape;
        if (shape.type === 'convexHull') return; // skip complex shapes

        // Use the GameObject's transform (authoritative after snapshot restore)
        // instead of Rapier collider position which lags until next physics step.
        obj.transform.updateWorldMatrix();
        const m = obj.transform.worldMatrix;
        const pos = { x: m[12]!, y: m[13]!, z: m[14]! };

        // Extract rotation quaternion from world matrix (ignoring scale)
        const sx = Math.sqrt(m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!) || 1;
        const sy = Math.sqrt(m[4]! * m[4]! + m[5]! * m[5]! + m[6]! * m[6]!) || 1;
        const sz = Math.sqrt(m[8]! * m[8]! + m[9]! * m[9]! + m[10]! * m[10]!) || 1;
        // Normalized rotation matrix columns
        const r00 = m[0]! / sx, r01 = m[4]! / sy, r02 = m[8]! / sz;
        const r10 = m[1]! / sx, r11 = m[5]! / sy, r12 = m[9]! / sz;
        const r20 = m[2]! / sx, r21 = m[6]! / sy, r22 = m[10]! / sz;
        // Matrix to quaternion
        const trace = r00 + r11 + r22;
        let qx: number, qy: number, qz: number, qw: number;
        if (trace > 0) {
          const s = 0.5 / Math.sqrt(trace + 1);
          qw = 0.25 / s; qx = (r21 - r12) * s; qy = (r02 - r20) * s; qz = (r10 - r01) * s;
        } else if (r00 > r11 && r00 > r22) {
          const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
          qw = (r21 - r12) / s; qx = 0.25 * s; qy = (r01 + r10) / s; qz = (r02 + r20) / s;
        } else if (r11 > r22) {
          const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
          qw = (r02 - r20) / s; qx = (r01 + r10) / s; qy = 0.25 * s; qz = (r12 + r21) / s;
        } else {
          const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
          qw = (r10 - r01) / s; qx = (r02 + r20) / s; qy = (r12 + r21) / s; qz = 0.25 * s;
        }
        const rot = { x: qx, y: qy, z: qz, w: qw };

        // Read scaled dimensions from live Rapier collider
        const entry: (typeof results)[0] = {
          shapeType: shape.type,
          position: pos,
          rotation: rot,
        };

        switch (shape.type) {
          case 'box':
            entry.halfExtents = {
              x: col.collider.halfExtents().x,
              y: col.collider.halfExtents().y,
              z: col.collider.halfExtents().z,
            };
            break;
          case 'sphere':
            entry.radius = col.collider.radius();
            break;
          case 'cylinder':
            entry.radius = col.collider.radius();
            entry.halfHeight = col.collider.halfHeight();
            break;
          case 'capsule':
            entry.radius = col.collider.radius();
            entry.halfHeight = col.collider.halfHeight();
            break;
        }

        results.push(entry);
      };

      // Collect from the object itself
      collectCollider(go);

      // Collect child colliders attached to this object's RigidBody
      const rb = go.getComponent(RigidBody);
      if (rb) {
        const collectChildren = (obj: GameObject) => {
          for (const child of obj.children) {
            collectCollider(child);
            if (!child.getComponent(RigidBody)) collectChildren(child);
          }
        };
        collectChildren(go);
      }

      return results.length > 0 ? results : null;
    },

    applyPhysicsSettings(settings: { gravity: [number, number, number]; fixedTimestep: number; solverIterations: number; substeps: number }) {
      world.setGravity(settings.gravity[0], settings.gravity[1], settings.gravity[2]);
      world.fixedTimestep = settings.fixedTimestep;
      world.setSolverIterations(settings.solverIterations);
      world.substeps = settings.substeps;
    },

    getJointGizmoData(go: GameObject) {
      const results: Array<{
        origin1: { x: number; y: number; z: number };
        dir1: { x: number; y: number; z: number };
        origin2: { x: number; y: number; z: number };
        dir2: { x: number; y: number; z: number };
      }> = [];

      // Collect hinges: on the selected object, plus reverse refs from other objects
      const hinges: HingeJoint[] = [];
      for (const comp of go.getComponents()) {
        if (comp instanceof HingeJoint) hinges.push(comp);
      }
      const scene = system?.scene;
      if (scene) {
        for (const other of scene.getAllObjects()) {
          if (other === go) continue;
          for (const comp of other.getComponents()) {
            if (comp instanceof HingeJoint && comp.connectedObject === go) {
              hinges.push(comp);
            }
          }
        }
      }

      for (const hinge of hinges) {
        // Ensure auto-configured anchor/axis are fresh before computing gizmo data
        hinge.refreshAutoConfig();

        const owner = hinge.gameObject;
        const connected = hinge.connectedObject;

        // Body 1 transform
        const t1 = owner.transform;
        t1.updateWorldMatrix();
        const m = t1.worldMatrix;

        // Extract scale-free rotation columns from body 1
        const s1x = Math.sqrt(m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!) || 1;
        const s1y = Math.sqrt(m[4]! * m[4]! + m[5]! * m[5]! + m[6]! * m[6]!) || 1;
        const s1z = Math.sqrt(m[8]! * m[8]! + m[9]! * m[9]! + m[10]! * m[10]!) || 1;

        // Anchor → world
        const a = hinge.anchor;
        const o1x = m[12]! + (m[0]! / s1x) * a[0]! + (m[4]! / s1y) * a[1]! + (m[8]! / s1z) * a[2]!;
        const o1y = m[13]! + (m[1]! / s1x) * a[0]! + (m[5]! / s1y) * a[1]! + (m[9]! / s1z) * a[2]!;
        const o1z = m[14]! + (m[2]! / s1x) * a[0]! + (m[6]! / s1y) * a[1]! + (m[10]! / s1z) * a[2]!;

        // Axis → world direction (rotation only)
        const ax = hinge.axis;
        let d1x = (m[0]! / s1x) * ax[0]! + (m[4]! / s1y) * ax[1]! + (m[8]! / s1z) * ax[2]!;
        let d1y = (m[1]! / s1x) * ax[0]! + (m[5]! / s1y) * ax[1]! + (m[9]! / s1z) * ax[2]!;
        let d1z = (m[2]! / s1x) * ax[0]! + (m[6]! / s1y) * ax[1]! + (m[10]! / s1z) * ax[2]!;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z) || 1;
        d1x /= len1; d1y /= len1; d1z /= len1;

        // Body 2 (connected object)
        let o2x = o1x, o2y = o1y, o2z = o1z;
        let d2x = d1x, d2y = d1y, d2z = d1z;

        if (connected) {
          const t2 = connected.transform;
          t2.updateWorldMatrix();
          const n = t2.worldMatrix;

          const s2x = Math.sqrt(n[0]! * n[0]! + n[1]! * n[1]! + n[2]! * n[2]!) || 1;
          const s2y = Math.sqrt(n[4]! * n[4]! + n[5]! * n[5]! + n[6]! * n[6]!) || 1;
          const s2z = Math.sqrt(n[8]! * n[8]! + n[9]! * n[9]! + n[10]! * n[10]!) || 1;

          const ca = hinge.connectedAnchor;
          o2x = n[12]! + (n[0]! / s2x) * ca[0]! + (n[4]! / s2y) * ca[1]! + (n[8]! / s2z) * ca[2]!;
          o2y = n[13]! + (n[1]! / s2x) * ca[0]! + (n[5]! / s2y) * ca[1]! + (n[9]! / s2z) * ca[2]!;
          o2z = n[14]! + (n[2]! / s2x) * ca[0]! + (n[6]! / s2y) * ca[1]! + (n[10]! / s2z) * ca[2]!;

          const cax = hinge.connectedAxis;
          d2x = (n[0]! / s2x) * cax[0]! + (n[4]! / s2y) * cax[1]! + (n[8]! / s2z) * cax[2]!;
          d2y = (n[1]! / s2x) * cax[0]! + (n[5]! / s2y) * cax[1]! + (n[9]! / s2z) * cax[2]!;
          d2z = (n[2]! / s2x) * cax[0]! + (n[6]! / s2y) * cax[1]! + (n[10]! / s2z) * cax[2]!;
          const len2 = Math.sqrt(d2x * d2x + d2y * d2y + d2z * d2z) || 1;
          d2x /= len2; d2y /= len2; d2z /= len2;
        }

        results.push({
          origin1: { x: o1x, y: o1y, z: o1z },
          dir1: { x: d1x, y: d1y, z: d1z },
          origin2: { x: o2x, y: o2y, z: o2z },
          dir2: { x: d2x, y: d2y, z: d2z },
        });
      }

      return results.length > 0 ? results : null;
    },
  };
}
