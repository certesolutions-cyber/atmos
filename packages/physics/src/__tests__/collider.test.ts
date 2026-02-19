import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { GameObject, resetGameObjectIds } from '@atmos/core';
import { PhysicsWorld } from '../physics-world.js';
import { RigidBody } from '../rigid-body.js';
import { Collider } from '../collider.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('Collider', () => {
  let world: PhysicsWorld;

  beforeEach(() => {
    resetGameObjectIds();
    world = new PhysicsWorld();
  });

  afterEach(() => {
    world.destroy();
  });

  it('creates a box collider attached to a RigidBody', () => {
    const go = new GameObject('BoxObj');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const col = go.addComponent(Collider);
    col.init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });

    expect(col.collider).not.toBeNull();
    expect(world.world.colliders.len()).toBe(1);
  });

  it('creates a sphere collider', () => {
    const go = new GameObject('SphereObj');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const col = go.addComponent(Collider);
    col.init(world, { shape: { type: 'sphere', radius: 1.0 } });

    expect(col.collider).not.toBeNull();
  });

  it('throws when no RigidBody is present', () => {
    const go = new GameObject('NoRB');
    const col = go.addComponent(Collider);

    expect(() => {
      col.init(world, {
        shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      });
    }).toThrow('Collider requires a RigidBody');
  });

  it('applies friction and restitution', () => {
    const go = new GameObject('FricObj');
    const rb = go.addComponent(RigidBody);
    rb.init(world, { type: 'dynamic' });

    const col = go.addComponent(Collider);
    col.init(world, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      friction: 0.8,
      restitution: 0.3,
    });

    expect(col.collider!.friction()).toBeCloseTo(0.8);
    expect(col.collider!.restitution()).toBeCloseTo(0.3);
  });

  describe('applyScale', () => {
    it('scales a box collider by transform scale', () => {
      const go = new GameObject('ScaleBox');
      const rb = go.addComponent(RigidBody);
      rb.init(world, { type: 'dynamic' });
      const col = go.addComponent(Collider);
      col.init(world, {
        shape: { type: 'box', halfExtents: { x: 1, y: 2, z: 3 } },
      });

      col.applyScale(2, 3, 0.5);

      const he = col.collider!.halfExtents();
      expect(he.x).toBeCloseTo(2);
      expect(he.y).toBeCloseTo(6);
      expect(he.z).toBeCloseTo(1.5);
    });

    it('scales a sphere collider by max axis', () => {
      const go = new GameObject('ScaleSphere');
      const rb = go.addComponent(RigidBody);
      rb.init(world, { type: 'dynamic' });
      const col = go.addComponent(Collider);
      col.init(world, { shape: { type: 'sphere', radius: 0.5 } });

      col.applyScale(1, 3, 2);

      expect(col.collider!.radius()).toBeCloseTo(1.5); // 0.5 * max(1,3,2)
    });

    it('scales a cylinder collider (height=sy, radius=max(sx,sz))', () => {
      const go = new GameObject('ScaleCyl');
      const rb = go.addComponent(RigidBody);
      rb.init(world, { type: 'dynamic' });
      const col = go.addComponent(Collider);
      col.init(world, {
        shape: { type: 'cylinder', halfHeight: 1, radius: 0.5 },
      });

      col.applyScale(2, 3, 1);

      expect(col.collider!.halfHeight()).toBeCloseTo(3); // 1 * 3
      expect(col.collider!.radius()).toBeCloseTo(1);     // 0.5 * max(2,1)
    });

    it('scales a capsule collider (height=sy, radius=max(sx,sz))', () => {
      const go = new GameObject('ScaleCap');
      const rb = go.addComponent(RigidBody);
      rb.init(world, { type: 'dynamic' });
      const col = go.addComponent(Collider);
      col.init(world, {
        shape: { type: 'capsule', halfHeight: 0.5, radius: 0.25 },
      });

      col.applyScale(4, 2, 1);

      expect(col.collider!.halfHeight()).toBeCloseTo(1);  // 0.5 * 2
      expect(col.collider!.radius()).toBeCloseTo(1);       // 0.25 * max(4,1)
    });

    it('uses absolute scale values (negative scale)', () => {
      const go = new GameObject('NegScale');
      const rb = go.addComponent(RigidBody);
      rb.init(world, { type: 'dynamic' });
      const col = go.addComponent(Collider);
      col.init(world, {
        shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } },
      });

      col.applyScale(-2, -3, -1);

      const he = col.collider!.halfExtents();
      expect(he.x).toBeCloseTo(2);
      expect(he.y).toBeCloseTo(3);
      expect(he.z).toBeCloseTo(1);
    });

    it('applies initial scale from transform at init time', () => {
      const go = new GameObject('InitScale');
      go.transform.setScale(2, 2, 2);
      const rb = go.addComponent(RigidBody);
      rb.init(world, { type: 'dynamic' });
      const col = go.addComponent(Collider);
      col.init(world, {
        shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      });

      const he = col.collider!.halfExtents();
      expect(he.x).toBeCloseTo(1);
      expect(he.y).toBeCloseTo(1);
      expect(he.z).toBeCloseTo(1);
    });
  });
});
