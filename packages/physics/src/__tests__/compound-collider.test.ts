import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { GameObject, Scene, resetGameObjectIds } from '@certe/atmos-core';
import { PhysicsWorld } from '../physics-world.js';
import { RigidBody } from '../rigid-body.js';
import { Collider } from '../collider.js';
import { PhysicsSystem } from '../physics-system.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('Compound Colliders', () => {
  let world: PhysicsWorld;

  beforeEach(() => {
    resetGameObjectIds();
    world = new PhysicsWorld();
  });

  afterEach(() => {
    world.destroy();
  });

  it('child collider attaches to parent RigidBody', () => {
    const parent = new GameObject('Parent');
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const child = new GameObject('Child');
    child.setParent(parent);
    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'sphere', radius: 0.5 } });

    expect(col.collider).not.toBeNull();
    expect(col.isChildCollider).toBe(true);
    expect(col.attachedBody).toBe(rb);
    expect(world.world.bodies.len()).toBe(1);
    expect(world.world.colliders.len()).toBe(1);
  });

  it('collider on same GO is not a child collider', () => {
    const go = new GameObject('Self');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });
    const col = go.addComponent(Collider);
    col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });

    expect(col.isChildCollider).toBe(false);
    expect(col.attachedBody).toBe(rb);
  });

  it('multiple children create multiple colliders on one body', () => {
    const parent = new GameObject('Parent');
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const child1 = new GameObject('Child1');
    child1.setParent(parent);
    child1.transform.setPosition(1, 0, 0);
    const col1 = child1.addComponent(Collider);
    col1.init(world, { shape: { type: 'sphere', radius: 0.3 } });

    const child2 = new GameObject('Child2');
    child2.setParent(parent);
    child2.transform.setPosition(-1, 0, 0);
    const col2 = child2.addComponent(Collider);
    col2.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });

    expect(world.world.bodies.len()).toBe(1);
    expect(world.world.colliders.len()).toBe(2);
    expect(col1.attachedBody).toBe(rb);
    expect(col2.attachedBody).toBe(rb);
  });

  it('child collider offset reflects local position', () => {
    const parent = new GameObject('Parent');
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });

    const child = new GameObject('Child');
    child.setParent(parent);
    child.transform.setPosition(2, 3, 0);

    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });

    // The collider's world translation = body pos (0,0,0) + offset → matches child local pos
    const tra = col.collider!.translation();
    expect(tra.x).toBeCloseTo(2);
    expect(tra.y).toBeCloseTo(3);
    expect(tra.z).toBeCloseTo(0);
  });

  it('child collider offset accounts for parent scale', () => {
    const parent = new GameObject('Parent');
    parent.transform.setScale(2, 2, 2);
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });

    const child = new GameObject('Child');
    child.setParent(parent);
    child.transform.setPosition(1, 0, 0); // world pos = 2,0,0 due to parent scale

    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });

    // Offset = inv(parentWorld) * childWorld → relative (1,0,0) in parent-scaled space
    const tra = col.collider!.translation();
    expect(tra.x).toBeCloseTo(1);
    expect(tra.y).toBeCloseTo(0);
    expect(tra.z).toBeCloseTo(0);
  });

  it('throws when no RigidBody in hierarchy', () => {
    const go = new GameObject('NoRB');
    const col = go.addComponent(Collider);
    expect(() => {
      col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });
    }).toThrow('Collider requires a RigidBody');
  });

  it('grandchild collider attaches to grandparent RigidBody', () => {
    const gp = new GameObject('GP');
    const rb = gp.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const parent = new GameObject('Parent');
    parent.setParent(gp);

    const child = new GameObject('Child');
    child.setParent(parent);
    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'sphere', radius: 0.5 } });

    expect(col.attachedBody).toBe(rb);
    expect(col.isChildCollider).toBe(true);
  });

  it('syncOffset updates collider position after local transform change', () => {
    const parent = new GameObject('Parent');
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });

    const child = new GameObject('Child');
    child.setParent(parent);
    child.transform.setPosition(1, 0, 0);

    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });

    // Move child
    child.transform.setPosition(0, 5, 0);
    col.syncOffset();

    // Rapier needs a step for setTranslationWrtParent to reflect in translation()
    world.step(1 / 60);

    const tra = col.collider!.translation();
    expect(tra.x).toBeCloseTo(0);
    expect(tra.y).toBeCloseTo(5);
    expect(tra.z).toBeCloseTo(0);
  });

  it('reattach moves collider to new parent body', () => {
    const parent1 = new GameObject('P1');
    const rb1 = parent1.addComponent(RigidBody);
    rb1.init(world, { type: 'fixed' });

    const parent2 = new GameObject('P2');
    const rb2 = parent2.addComponent(RigidBody);
    rb2.init(world, { type: 'fixed' });

    const child = new GameObject('Child');
    child.setParent(parent1);
    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'sphere', radius: 0.5 } });
    expect(col.attachedBody).toBe(rb1);

    // Reparent
    child.setParent(parent2);
    col.reattach(world);
    expect(col.attachedBody).toBe(rb2);
  });

  it('RigidBody destroy nullifies child collider handles', () => {
    const parent = new GameObject('Parent');
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const child = new GameObject('Child');
    child.setParent(parent);
    const col = child.addComponent(Collider);
    col.init(world, { shape: { type: 'sphere', radius: 0.5 } });

    expect(col.collider).not.toBeNull();

    // Destroy parent's RigidBody
    parent.removeComponent(rb);

    // Child collider handle should be nullified
    expect(col.collider).toBeNull();
  });

  it('compound body falls as one unit in simulation', () => {
    const scene = new Scene();
    const system = new PhysicsSystem(world, scene);

    const parent = new GameObject('Parent');
    parent.transform.setPosition(0, 10, 0);
    const rb = parent.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });
    // Collider on parent itself
    parent.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });

    const child = new GameObject('Child');
    child.setParent(parent);
    child.transform.setPosition(1, 0, 0);
    child.addComponent(Collider).init(world, {
      shape: { type: 'sphere', radius: 0.3 },
    });

    scene.add(parent);
    scene.add(child);

    // Step a few frames
    for (let i = 0; i < 10; i++) {
      system.step(1 / 60);
    }

    // Parent should have fallen
    expect(parent.transform.position[1]!).toBeLessThan(10);
  });
});
