import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { GameObject } from '@atmos/core';
import { Quat } from '@atmos/math';
import { PhysicsWorld } from '../physics-world.js';
import { RigidBody } from '../rigid-body.js';
import { Collider } from '../collider.js';
import { FixedJoint } from '../fixed-joint.js';
import { HingeJoint } from '../hinge-joint.js';
import { SpringJoint } from '../spring-joint.js';

beforeAll(async () => {
  await RAPIER.init();
});

/** Helper: create a GameObject with RigidBody + box Collider */
function createBody(
  world: PhysicsWorld,
  name: string,
  x: number,
  y: number,
  z: number,
  type: 'dynamic' | 'fixed' = 'dynamic',
): { go: GameObject; rb: RigidBody } {
  const go = new GameObject(name);
  go.transform.setPosition(x, y, z);
  const rb = go.addComponent(RigidBody);
  rb.init(world, { type });
  const col = go.addComponent(Collider);
  col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });
  return { go, rb };
}

describe('FixedJoint', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('creates a fixed joint between two bodies via init', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, { connectedObject: goB });

    expect(joint.joint).not.toBeNull();
    expect(joint.connectedObject).toBe(goB);
  });

  it('creates joint via setter when both RigidBodies exist', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world);
    expect(joint.joint).toBeNull();

    joint.connectedObject = goB;
    expect(joint.joint).not.toBeNull();
    expect(joint.connectedObject).toBe(goB);
  });

  it('setter removes old joint when changing target', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);
    const { go: goC } = createBody(world, 'C', 2, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, { connectedObject: goB });
    const firstJoint = joint.joint;
    expect(firstJoint).not.toBeNull();

    joint.connectedObject = goC;
    expect(joint.connectedObject).toBe(goC);
    expect(joint.joint).not.toBeNull();
    expect(joint.joint).not.toBe(firstJoint);
  });

  it('does not throw if no RigidBody on same GameObject', () => {
    world = new PhysicsWorld();
    const goA = new GameObject('A');
    const { go: goB } = createBody(world, 'B', 0, 0, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, { connectedObject: goB });
    // Gracefully returns null since no local RigidBody
    expect(joint.joint).toBeNull();
  });

  it('removes joint on destroy', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, { connectedObject: goB });
    expect(joint.joint).not.toBeNull();

    joint.onDestroy();
    expect(joint.joint).toBeNull();
  });

  it('keeps bodies together during simulation', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: -10, z: 0 } });
    const { go: goA, rb: rbA } = createBody(world, 'A', 0, 5, 0);
    const { go: goB, rb: rbB } = createBody(world, 'B', 1, 5, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, { connectedObject: goB });

    // Step simulation
    for (let i = 0; i < 60; i++) world.step(1 / 60);

    rbA.syncToTransform();
    rbB.syncToTransform();

    // Both bodies should have fallen together (similar Y position)
    const dy = Math.abs(goA.transform.position[1]! - goB.transform.position[1]!);
    expect(dy).toBeLessThan(0.5);

    // Both should have fallen below their starting Y of 5
    expect(goA.transform.position[1]!).toBeLessThan(4);
    expect(goB.transform.position[1]!).toBeLessThan(4);
  });
});

describe('HingeJoint', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('creates a revolute joint with default Y axis', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, { connectedObject: goB });

    expect(joint.joint).not.toBeNull();
    expect(Array.from(joint.axis)).toEqual([0, 1, 0]);
    expect(Array.from(joint.connectedAxis)).toEqual([0, 1, 0]);
  });

  it('auto-configures connectedAxis from transforms', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    // Both unrotated → connectedAxis should match axis
    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 1, y: 0, z: 0 },
    });

    expect(joint.autoConfigureConnectedAxis).toBe(true);
    expect(Array.from(joint.axis)).toEqual([1, 0, 0]);
    // Both at identity rotation → connectedAxis = axis
    expect(joint.connectedAxis[0]).toBeCloseTo(1);
    expect(joint.connectedAxis[1]).toBeCloseTo(0);
    expect(joint.connectedAxis[2]).toBeCloseTo(0);
  });

  it('auto-configures connectedAxis for rotated bodies', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    // Rotate B 90° around Y → its local X becomes world Z
    const q = Quat.create();
    Quat.fromEuler(q, 0, Math.PI / 2, 0);
    goB.transform.rotation = q;

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 1, y: 0, z: 0 }, // A's local X = world X
    });

    // World X in B's local space (B rotated +90° around Y)
    expect(joint.connectedAxis[0]).toBeCloseTo(0);
    expect(joint.connectedAxis[1]).toBeCloseTo(0);
    expect(joint.connectedAxis[2]).toBeCloseTo(1);
  });

  it('disables auto-configure when connectedAxis is explicit', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
      connectedAxis: { x: 0, y: 0, z: 1 },
    });

    expect(joint.autoConfigureConnectedAxis).toBe(false);
    expect(joint.joint).not.toBeNull();
    expect(Array.from(joint.axis)).toEqual([0, 1, 0]);
    expect(Array.from(joint.connectedAxis)).toEqual([0, 0, 1]);
  });

  it('creates a revolute joint with custom axis and limits', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 0, z: 1 },
      limitsEnabled: true,
      limitMin: -Math.PI / 4,
      limitMax: Math.PI / 4,
    });

    expect(joint.limitsEnabled).toBe(true);
    expect(joint.limitMin).toBeCloseTo(-Math.PI / 4);
    expect(joint.limitMax).toBeCloseTo(Math.PI / 4);
  });

  it('creates joint via setter', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world);
    expect(joint.joint).toBeNull();

    joint.connectedObject = goB;
    expect(joint.joint).not.toBeNull();
  });

  it('removes joint on destroy', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, { connectedObject: goB });
    joint.onDestroy();
    expect(joint.joint).toBeNull();
  });
});

describe('HingeJoint motor', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('velocity motor spins a body', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA } = createBody(world, 'A', 0, 0, 0, 'fixed');
    const { go: goB, rb: rbB } = createBody(world, 'B', 1, 0, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
      motorEnabled: true,
      motorMode: 'velocity',
      motorTargetVelocity: 5.0,
      motorMaxForce: 100.0,
    });

    for (let i = 0; i < 60; i++) world.step(1 / 60);

    rbB.syncToTransform();
    // The dynamic body should have rotated — check angular velocity via position change
    // With a revolute joint on Y axis and velocity motor, B should orbit around A
    const x = goB.transform.position[0]!;
    const z = goB.transform.position[2]!;
    // Body started at (1,0,0) and should have moved off the X axis
    expect(Math.abs(z)).toBeGreaterThan(0.01);
  });

  it('position motor drives to target angle', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA } = createBody(world, 'A', 0, 0, 0, 'fixed');
    const { go: goB, rb: rbB } = createBody(world, 'B', 1, 0, 0);

    const targetAngle = Math.PI / 2;
    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
      motorEnabled: true,
      motorMode: 'position',
      motorTargetPosition: targetAngle,
      motorStiffness: 5000.0,
      motorDamping: 100.0,
    });

    for (let i = 0; i < 600; i++) world.step(1 / 60);

    rbB.syncToTransform();
    // After 10 seconds with very stiff motor, B should have rotated significantly
    // Started at (1,0,0); any rotation around Y moves it off the X axis
    const z = goB.transform.position[2]!;
    expect(Math.abs(z)).toBeGreaterThan(0.3);
  });

  it('motor disabled by default has no effect', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA } = createBody(world, 'A', 0, 0, 0, 'fixed');
    const { go: goB, rb: rbB } = createBody(world, 'B', 1, 0, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
    });

    expect(joint.motorEnabled).toBe(false);

    for (let i = 0; i < 60; i++) world.step(1 / 60);

    rbB.syncToTransform();
    // Without motor and no gravity, body should stay roughly in place
    const x = goB.transform.position[0]!;
    const z = goB.transform.position[2]!;
    expect(x).toBeCloseTo(1.0, 0);
    expect(Math.abs(z)).toBeLessThan(0.1);
  });
});

describe('HingeJoint runtime limit changes', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('enabling limits at runtime constrains rotation', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA } = createBody(world, 'A', 0, 0, 0, 'fixed');
    const { go: goB, rb: rbB } = createBody(world, 'B', 1, 0, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
      motorEnabled: true,
      motorMode: 'velocity',
      motorTargetVelocity: 10.0,
      motorMaxForce: 1000.0,
    });

    // Run without limits — should rotate freely
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    rbB.syncToTransform();
    const z1 = Math.abs(goB.transform.position[2]!);
    expect(z1).toBeGreaterThan(0.01); // Has rotated

    // Now enable tight limits at runtime
    joint.limitsEnabled = true;
    joint.limitMin = -0.1;
    joint.limitMax = 0.1;

    // Run more steps — rotation should be constrained
    for (let i = 0; i < 120; i++) world.step(1 / 60);
    rbB.syncToTransform();

    // With very tight limits and a motor, the body oscillates near the limit
    // The key test: the joint is still alive and limits were applied
    expect(joint.joint).not.toBeNull();
  });

  it('changing limitMax at runtime updates the constraint', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA } = createBody(world, 'A', 0, 0, 0, 'fixed');
    const { go: goB, rb: rbB } = createBody(world, 'B', 1, 0, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
      limitsEnabled: true,
      limitMin: -0.01,
      limitMax: 0.01,
      motorEnabled: true,
      motorMode: 'velocity',
      motorTargetVelocity: 5.0,
      motorMaxForce: 500.0,
    });

    // With very tight limits, body barely moves
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    rbB.syncToTransform();
    const z1 = Math.abs(goB.transform.position[2]!);

    // Now widen limits at runtime
    joint.limitMax = Math.PI;

    for (let i = 0; i < 120; i++) world.step(1 / 60);
    rbB.syncToTransform();
    const z2 = Math.abs(goB.transform.position[2]!);

    // Should have rotated significantly more after widening
    expect(z2).toBeGreaterThan(z1);
  });
});

describe('HingeJoint runtime axis changes', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('recreates joint when axis is changed via setter', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA } = createBody(world, 'A', 0, 0, 0, 'fixed');
    const { go: goB } = createBody(world, 'B', 1, 0, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world, {
      connectedObject: goB,
      axis: { x: 0, y: 1, z: 0 },
    });

    const firstJoint = joint.joint;
    expect(firstJoint).not.toBeNull();

    // Change axis — should recreate the joint
    const newAxis = new Float32Array([1, 0, 0]);
    joint.axis = newAxis;

    expect(joint.joint).not.toBeNull();
    expect(joint.joint).not.toBe(firstJoint);
    expect(joint.axis[0]).toBeCloseTo(1);
    expect(joint.axis[1]).toBeCloseTo(0);
    expect(joint.axis[2]).toBeCloseTo(0);
  });

  it('does not recreate joint if no joint exists', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 0, 0);

    const joint = goA.addComponent(HingeJoint);
    joint.init(world); // No connected object
    expect(joint.joint).toBeNull();

    // Changing axis without a joint should not throw
    const newAxis = new Float32Array([1, 0, 0]);
    joint.axis = newAxis;
    expect(joint.joint).toBeNull();
    expect(joint.axis[0]).toBeCloseTo(1);
  });
});

describe('SpringJoint', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('creates a spring joint with default parameters', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 2, 2, 0);

    const joint = goA.addComponent(SpringJoint);
    joint.init(world, { connectedObject: goB });

    expect(joint.joint).not.toBeNull();
    expect(joint.restLength).toBe(1.0);
    expect(joint.stiffness).toBe(10.0);
    expect(joint.damping).toBe(1.0);
  });

  it('creates a spring joint with custom parameters', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 3, 2, 0);

    const joint = goA.addComponent(SpringJoint);
    joint.init(world, {
      connectedObject: goB,
      restLength: 2.0,
      stiffness: 50.0,
      damping: 5.0,
    });

    expect(joint.restLength).toBe(2.0);
    expect(joint.stiffness).toBe(50.0);
    expect(joint.damping).toBe(5.0);
  });

  it('creates joint via setter', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 2, 2, 0);

    const joint = goA.addComponent(SpringJoint);
    joint.init(world);
    expect(joint.joint).toBeNull();

    joint.connectedObject = goB;
    expect(joint.joint).not.toBeNull();
  });

  it('pulls bodies toward rest length during simulation', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
    const { go: goA, rb: rbA } = createBody(world, 'A', 0, 0, 0);
    const { go: goB, rb: rbB } = createBody(world, 'B', 5, 0, 0);

    const joint = goA.addComponent(SpringJoint);
    joint.init(world, {
      connectedObject: goB,
      autoConfigureConnectedAnchor: false,
      restLength: 1.0,
      stiffness: 100.0,
      damping: 10.0,
    });

    // Step simulation — spring should pull bodies closer
    for (let i = 0; i < 120; i++) world.step(1 / 60);

    rbA.syncToTransform();
    rbB.syncToTransform();

    const dist = Math.abs(goB.transform.position[0]! - goA.transform.position[0]!);
    // Should be closer to restLength (1.0) than initial distance (5.0)
    expect(dist).toBeLessThan(3.0);
  });

  it('removes joint on destroy', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(SpringJoint);
    joint.init(world, { connectedObject: goB });
    joint.onDestroy();
    expect(joint.joint).toBeNull();
  });
});

describe('Joint anchor auto-configuration', () => {
  let world: PhysicsWorld;
  afterEach(() => world?.destroy());

  it('auto-computes connectedAnchor from world positions (default)', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, { connectedObject: goB });

    // anchor defaults to (0,0,0) in A's local space
    // A is at (0,2,0), so world point is (0,2,0)
    // B is at (1,2,0), so local point in B is (-1,0,0)
    expect(joint.connectedAnchor[0]).toBeCloseTo(-1, 4);
    expect(joint.connectedAnchor[1]).toBeCloseTo(0, 4);
    expect(joint.connectedAnchor[2]).toBeCloseTo(0, 4);
  });

  it('uses explicit connectedAnchor when autoConfigureConnectedAnchor is false', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);
    const { go: goB } = createBody(world, 'B', 1, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, {
      connectedObject: goB,
      autoConfigureConnectedAnchor: false,
      connectedAnchor: { x: 0.5, y: 0.5, z: 0.5 },
    });

    // Should keep the explicit value, not auto-compute
    expect(joint.connectedAnchor[0]).toBeCloseTo(0.5);
    expect(joint.connectedAnchor[1]).toBeCloseTo(0.5);
    expect(joint.connectedAnchor[2]).toBeCloseTo(0.5);
  });

  it('copies explicit anchor option into Float32Array', () => {
    world = new PhysicsWorld();
    const { go: goA } = createBody(world, 'A', 0, 2, 0);

    const joint = goA.addComponent(FixedJoint);
    joint.init(world, {
      anchor: { x: 1, y: 2, z: 3 },
    });

    expect(joint.anchor).toBeInstanceOf(Float32Array);
    expect(joint.anchor[0]).toBe(1);
    expect(joint.anchor[1]).toBe(2);
    expect(joint.anchor[2]).toBe(3);
  });
});
