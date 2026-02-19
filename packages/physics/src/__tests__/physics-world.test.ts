import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics-world.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('PhysicsWorld', () => {
  let world: PhysicsWorld;

  afterEach(() => {
    world?.destroy();
  });

  it('creates a world with default gravity', () => {
    world = new PhysicsWorld();
    const g = world.world.gravity;
    expect(g.x).toBe(0);
    expect(g.y).toBeCloseTo(-9.81);
    expect(g.z).toBe(0);
  });

  it('creates a world with custom gravity', () => {
    world = new PhysicsWorld({ gravity: { x: 0, y: -20, z: 0 } });
    expect(world.world.gravity.y).toBe(-20);
  });

  it('uses default fixed timestep of 1/60', () => {
    world = new PhysicsWorld();
    expect(world.fixedTimestep).toBeCloseTo(1 / 60);
  });

  it('uses custom fixed timestep', () => {
    world = new PhysicsWorld({ fixedTimestep: 1 / 120 });
    expect(world.fixedTimestep).toBeCloseTo(1 / 120);
  });

  it('accumulator does not step when dt < fixedTimestep', () => {
    world = new PhysicsWorld({ fixedTimestep: 1 / 60 });
    const steps = world.step(0.005);
    expect(steps).toBe(0);
  });

  it('accumulator takes exactly one step at fixedTimestep', () => {
    world = new PhysicsWorld({ fixedTimestep: 1 / 60 });
    const steps = world.step(1 / 60);
    expect(steps).toBe(1);
  });

  it('accumulator takes multiple steps for large dt', () => {
    world = new PhysicsWorld({ fixedTimestep: 1 / 60 });
    const steps = world.step(3 / 60);
    expect(steps).toBe(3);
  });
});
