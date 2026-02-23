import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Scene, GameObject } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import { PhysicsWorld } from '../physics-world.js';
import { RigidBody } from '../rigid-body.js';
import { Collider } from '../collider.js';
import { Physics } from '../physics-query.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('Physics queries', () => {
  let world: PhysicsWorld;
  let scene: Scene;

  /** Create a static box at the given position with half-extents 0.5. */
  function createBox(x: number, y: number, z: number, name = 'box'): GameObject {
    const go = new GameObject(name);
    scene.add(go);
    go.transform.position[0] = x;
    go.transform.position[1] = y;
    go.transform.position[2] = z;

    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'fixed' });

    const col = go.addComponent(Collider);
    col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });

    return go;
  }

  beforeEach(() => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    scene = new Scene();
    Scene.current = scene;
  });

  afterEach(() => {
    world.destroy();
    Scene.current = null;
  });

  // --- raycast ---

  it('raycast hits a box', () => {
    createBox(0, 0, -5);
    // Step so colliders are committed
    world.step(1 / 60);

    const origin = Vec3.fromValues(0, 0, 0);
    const dir = Vec3.fromValues(0, 0, -1);
    const hit = Physics.raycast(world, origin, dir, 100);

    expect(hit).not.toBeNull();
    expect(hit!.gameObject.name).toBe('box');
    expect(hit!.distance).toBeCloseTo(4.5, 1); // box at z=-5, half-extent 0.5
    expect(hit!.point[2]).toBeCloseTo(-4.5, 1);
  });

  it('raycast returns null on miss', () => {
    createBox(0, 0, -5);
    world.step(1 / 60);

    const origin = Vec3.fromValues(0, 0, 0);
    const dir = Vec3.fromValues(0, 1, 0); // shoot up, box is forward
    const hit = Physics.raycast(world, origin, dir, 100);

    expect(hit).toBeNull();
  });

  it('raycast respects maxDist', () => {
    createBox(0, 0, -10);
    world.step(1 / 60);

    const origin = Vec3.fromValues(0, 0, 0);
    const dir = Vec3.fromValues(0, 0, -1);
    const hit = Physics.raycast(world, origin, dir, 5); // box face at z=-9.5, too far

    expect(hit).toBeNull();
  });

  // --- raycastAll ---

  it('raycastAll returns multiple hits', () => {
    createBox(0, 0, -3, 'near');
    createBox(0, 0, -8, 'far');
    world.step(1 / 60);

    const origin = Vec3.fromValues(0, 0, 0);
    const dir = Vec3.fromValues(0, 0, -1);
    const hits = Physics.raycastAll(world, origin, dir, 100);

    expect(hits.length).toBe(2);
  });

  // --- sphereCast ---

  it('sphereCast detects overlap', () => {
    createBox(0, 0, 0);
    world.step(1 / 60);

    const center = Vec3.fromValues(0, 0, 0);
    const hit = Physics.sphereCast(world, center, 1.0);

    expect(hit).not.toBeNull();
    expect(hit!.gameObject.name).toBe('box');
  });

  it('sphereCast returns null when no overlap', () => {
    createBox(0, 0, -10);
    world.step(1 / 60);

    const center = Vec3.fromValues(0, 0, 0);
    const hit = Physics.sphereCast(world, center, 0.5);

    expect(hit).toBeNull();
  });

  // --- sphereCastAll ---

  it('sphereCastAll returns all overlapping', () => {
    createBox(-0.5, 0, 0, 'a');
    createBox(0.5, 0, 0, 'b');
    world.step(1 / 60);

    const center = Vec3.fromValues(0, 0, 0);
    const hits = Physics.sphereCastAll(world, center, 2.0);

    expect(hits.length).toBe(2);
  });

  // --- boxCast ---

  it('boxCast detects overlap', () => {
    createBox(0, 0, 0);
    world.step(1 / 60);

    const center = Vec3.fromValues(0, 0, 0);
    const half = Vec3.fromValues(1, 1, 1);
    const hit = Physics.boxCast(world, center, half);

    expect(hit).not.toBeNull();
  });

  it('boxCast returns null when no overlap', () => {
    createBox(0, 0, -10);
    world.step(1 / 60);

    const center = Vec3.fromValues(0, 0, 0);
    const half = Vec3.fromValues(0.5, 0.5, 0.5);
    const hit = Physics.boxCast(world, center, half);

    expect(hit).toBeNull();
  });

  // --- boxCastAll ---

  it('boxCastAll returns all overlapping', () => {
    createBox(-1, 0, 0, 'a');
    createBox(1, 0, 0, 'b');
    world.step(1 / 60);

    const center = Vec3.fromValues(0, 0, 0);
    const half = Vec3.fromValues(2, 2, 2);
    const hits = Physics.boxCastAll(world, center, half);

    expect(hits.length).toBe(2);
  });
});
