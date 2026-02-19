import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { GameObject, resetGameObjectIds } from '@atmos/core';
import { PhysicsWorld } from '../physics-world.js';
import { RigidBody } from '../rigid-body.js';
import { Collider } from '../collider.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('RigidBody', () => {
  let world: PhysicsWorld;

  beforeEach(() => {
    resetGameObjectIds();
    world = new PhysicsWorld();
  });

  afterEach(() => {
    world.destroy();
  });

  it('creates a dynamic body at transform position', () => {
    const go = new GameObject('DynObj');
    go.transform.setPosition(1, 5, 3);
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    expect(rb.body).not.toBeNull();
    const pos = rb.body!.translation();
    expect(pos.x).toBeCloseTo(1);
    expect(pos.y).toBeCloseTo(5);
    expect(pos.z).toBeCloseTo(3);
  });

  it('creates a fixed body', () => {
    const go = new GameObject('FixedObj');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });
    expect(rb.bodyType).toBe('fixed');
    expect(rb.body!.isFixed()).toBe(true);
  });

  it('creates a kinematic body', () => {
    const go = new GameObject('KinObj');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'kinematic' });
    expect(rb.bodyType).toBe('kinematic');
    expect(rb.body!.isKinematic()).toBe(true);
  });

  it('syncToTransform copies Rapier position to Transform', () => {
    const go = new GameObject('SyncObj');
    go.transform.setPosition(0, 10, 0);
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });
    go.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });

    // Step physics so gravity moves the body
    world.step(1 / 60);
    rb.syncToTransform();

    // Y should have decreased due to gravity
    expect(go.transform.position[1]!).toBeLessThan(10);
  });

  it('syncFromTransform copies Transform to Rapier (kinematic)', () => {
    const go = new GameObject('KinSync');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'kinematic' });

    go.transform.setPosition(5, 5, 5);
    rb.syncFromTransform();
    world.step(1 / 60);

    const pos = rb.body!.translation();
    expect(pos.x).toBeCloseTo(5);
    expect(pos.y).toBeCloseTo(5);
    expect(pos.z).toBeCloseTo(5);
  });

  it('onDestroy removes body from world', () => {
    const go = new GameObject('DestroyObj');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });
    expect(world.world.bodies.len()).toBe(1);

    rb.onDestroy!();
    expect(world.world.bodies.len()).toBe(0);
    expect(rb.body).toBeNull();
  });
});
