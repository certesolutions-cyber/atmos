import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { GameObject, Scene, resetGameObjectIds } from '@atmos/core';
import { PhysicsWorld } from '../physics-world.js';
import { RigidBody } from '../rigid-body.js';
import { Collider } from '../collider.js';
import { PhysicsSystem } from '../physics-system.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('PhysicsSystem', () => {
  let world: PhysicsWorld;
  let scene: Scene;
  let system: PhysicsSystem;

  beforeEach(() => {
    resetGameObjectIds();
    world = new PhysicsWorld();
    scene = new Scene();
    system = new PhysicsSystem(world, scene);
  });

  afterEach(() => {
    world.destroy();
  });

  it('syncs dynamic bodies after step', () => {
    const go = new GameObject('Dyn');
    go.transform.setPosition(0, 10, 0);
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });
    go.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    scene.add(go);

    system.step(1 / 60);

    // Gravity should have pulled the object down
    expect(go.transform.position[1]!).toBeLessThan(10);
  });

  it('syncs kinematic bodies before step', () => {
    const go = new GameObject('Kin');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'kinematic' });
    go.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    scene.add(go);

    // Move transform, system should push it to Rapier
    go.transform.setPosition(3, 0, 0);
    system.step(1 / 60);

    const pos = rb.body!.translation();
    expect(pos.x).toBeCloseTo(3);
  });

  it('skips disabled RigidBody components', () => {
    const go = new GameObject('Disabled');
    go.transform.setPosition(0, 10, 0);
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });
    rb.enabled = false;
    scene.add(go);

    system.step(1 / 60);

    // Transform should be unchanged since component is disabled
    expect(go.transform.position[1]!).toBe(10);
  });

  it('does not move fixed bodies', () => {
    const go = new GameObject('Fixed');
    go.transform.setPosition(0, 5, 0);
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });
    go.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 5, y: 0.5, z: 5 } },
    });
    scene.add(go);

    system.step(1 / 60);

    // Fixed bodies: system doesn't sync them, so position stays at init value
    expect(go.transform.position[1]!).toBe(5);
  });

  it('syncs collider dimensions when transform scale changes', () => {
    const go = new GameObject('Scaled');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });
    const col = go.addComponent(Collider);
    col.init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    scene.add(go);

    // First step caches scale
    system.step(1 / 60);

    // Change scale
    go.transform.setScale(2, 3, 4);
    system.step(1 / 60);

    const he = col.collider!.halfExtents();
    expect(he.x).toBeCloseTo(1);   // 0.5 * 2
    expect(he.y).toBeCloseTo(1.5); // 0.5 * 3
    expect(he.z).toBeCloseTo(2);   // 0.5 * 4
  });

  it('dynamic body collides with fixed floor', () => {
    // Floor at y=0
    const floor = new GameObject('Floor');
    floor.transform.setPosition(0, 0, 0);
    const floorRb = floor.addComponent(RigidBody);
    floorRb.init(world, { type: 'fixed' });
    floor.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 50, y: 0.5, z: 50 } },
    });
    scene.add(floor);

    // Cube slightly above floor
    const cube = new GameObject('Cube');
    cube.transform.setPosition(0, 2, 0);
    const cubeRb = cube.addComponent(RigidBody);
    cubeRb.init(world, { type: 'dynamic' });
    cube.addComponent(Collider).init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    scene.add(cube);

    // Run physics for ~2 seconds
    for (let i = 0; i < 120; i++) {
      system.step(1 / 60);
    }

    // Cube should have landed on the floor (y ~ 1.0 = floor halfExtent + cube halfExtent)
    expect(cube.transform.position[1]!).toBeGreaterThan(0.4);
    expect(cube.transform.position[1]!).toBeLessThan(2.0);
  });
});
