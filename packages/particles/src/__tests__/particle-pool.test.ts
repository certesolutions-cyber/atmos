import { describe, it, expect } from 'vitest';
import { ParticlePool } from '../particle-pool.js';

describe('ParticlePool', () => {
  it('creates pool with correct capacity', () => {
    const pool = new ParticlePool({ maxParticles: 100 });
    expect(pool.maxParticles).toBe(100);
    expect(pool.aliveCount).toBe(0);
    expect(pool.particles).toHaveLength(100);
  });

  it('emits a particle into a dead slot', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit();
    expect(p).not.toBeNull();
    expect(p!.alive).toBe(true);
    expect(p!.age).toBe(0);
  });

  it('returns null when pool is full', () => {
    const pool = new ParticlePool({ maxParticles: 2 });
    const p1 = pool.emit();
    const p2 = pool.emit();
    const p3 = pool.emit();
    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(p3).toBeNull();
  });

  it('simulates particle movement', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit()!;
    p.lifetime = 5;
    p.x = 0; p.y = 0; p.z = 0;
    p.vx = 1; p.vy = 2; p.vz = 3;

    pool.simulate(1, 0, 0, 0);

    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
    expect(pool.aliveCount).toBe(1);
  });

  it('applies gravity during simulation', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit()!;
    p.lifetime = 5;
    p.vx = 0; p.vy = 0; p.vz = 0;

    pool.simulate(1, 0, -9.81, 0);

    expect(p.vy).toBeCloseTo(-9.81);
    expect(p.y).toBeCloseTo(-9.81);
  });

  it('kills particles that exceed their lifetime', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit()!;
    p.lifetime = 0.5;

    pool.simulate(0.3, 0, 0, 0);
    expect(pool.aliveCount).toBe(1);

    pool.simulate(0.3, 0, 0, 0);
    expect(pool.aliveCount).toBe(0);
    expect(p.alive).toBe(false);
  });

  it('recycles dead slots', () => {
    const pool = new ParticlePool({ maxParticles: 1 });
    const p1 = pool.emit()!;
    p1.lifetime = 0.1;

    pool.simulate(0.2, 0, 0, 0); // kills p1
    expect(pool.aliveCount).toBe(0);

    const p2 = pool.emit();
    expect(p2).not.toBeNull();
    expect(p2!.alive).toBe(true);
  });

  it('interpolates size over lifetime', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit()!;
    p.lifetime = 2;
    p.startSize = 1;
    p.endSize = 0;

    pool.simulate(1, 0, 0, 0); // t = 0.5
    expect(p.size).toBeCloseTo(0.5);
  });

  it('interpolates color over lifetime', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit()!;
    p.lifetime = 2;
    p.startR = 1; p.endR = 0;
    p.startG = 0; p.endG = 1;
    p.startB = 0.5; p.endB = 0.5;

    pool.simulate(1, 0, 0, 0); // t = 0.5
    expect(p.r).toBeCloseTo(0.5);
    expect(p.g).toBeCloseTo(0.5);
    expect(p.b).toBeCloseTo(0.5);
  });

  it('packs alive particles contiguously into gpuData', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p1 = pool.emit()!;
    p1.lifetime = 5;
    p1.x = 1; p1.y = 2; p1.z = 3;
    p1.startSize = 0.5; p1.endSize = 0.5;
    p1.startR = 1; p1.startG = 0; p1.startB = 0; p1.startA = 1;
    p1.endR = 1; p1.endG = 0; p1.endB = 0; p1.endA = 1;

    const p2 = pool.emit()!;
    p2.lifetime = 5;
    p2.x = 4; p2.y = 5; p2.z = 6;
    p2.size = 0.3;

    pool.simulate(0, 0, 0, 0);

    // Particle 1 at offset 0
    expect(pool.gpuData[0]).toBe(1); // x
    expect(pool.gpuData[1]).toBe(2); // y
    expect(pool.gpuData[2]).toBe(3); // z
    expect(pool.gpuData[3]).toBe(0.5); // size

    // Particle 2 at offset 12
    expect(pool.gpuData[12]).toBe(4); // x
    expect(pool.gpuData[13]).toBe(5); // y
    expect(pool.gpuData[14]).toBe(6); // z
  });

  it('updates rotation over time', () => {
    const pool = new ParticlePool({ maxParticles: 10 });
    const p = pool.emit()!;
    p.lifetime = 5;
    p.rotation = 0;
    p.rotationSpeed = 2;

    pool.simulate(1, 0, 0, 0);
    expect(p.rotation).toBeCloseTo(2);
  });
});
