import { describe, it, expect, beforeEach } from 'vitest';
import { GameObject, Scene } from '@certe/atmos-core';
import { ParticleEmitter } from '../particle-emitter.js';

describe('ParticleEmitter (CPU simulation)', () => {
  let scene: Scene;

  beforeEach(() => {
    scene = new Scene();
    Scene.current = scene;
  });

  it('has correct default values', () => {
    const go = new GameObject('Emitter');
    const pe = go.addComponent(ParticleEmitter);
    expect(pe.emissionRate).toBe(10);
    expect(pe.maxParticles).toBe(200);
    expect(pe.emitting).toBe(true);
    expect(pe.gravity).toBe(-2);
    expect(pe.startSize).toBe(0.2);
    expect(pe.aliveCount).toBe(0);
  });

  it('creates pool on awake', () => {
    const go = new GameObject('Emitter');
    const pe = go.addComponent(ParticleEmitter);
    pe.maxParticles = 50;
    pe.onAwake!();

    expect(pe.pool).not.toBeNull();
    expect(pe.aliveCount).toBe(0);
  });

  it('emits particles on update based on emission rate', () => {
    const go = new GameObject('Emitter');
    go.transform.setPosition(0, 0, 0);
    go.transform.updateWorldMatrix();
    scene.add(go);

    const pe = go.addComponent(ParticleEmitter);
    pe.emissionRate = 100;
    pe.maxParticles = 50;
    pe.onAwake!();

    // 100 particles/sec * 0.1 sec = 10 particles
    pe.onUpdate!(0.1);
    expect(pe.aliveCount).toBe(10);
  });

  it('does not emit when emitting is false', () => {
    const go = new GameObject('Emitter');
    go.transform.updateWorldMatrix();
    const pe = go.addComponent(ParticleEmitter);
    pe.emitting = false;
    pe.emissionRate = 100;
    pe.onAwake!();

    pe.onUpdate!(1);
    expect(pe.aliveCount).toBe(0);
  });

  it('burst emits N particles at once', () => {
    const go = new GameObject('Emitter');
    go.transform.updateWorldMatrix();
    scene.add(go);

    const pe = go.addComponent(ParticleEmitter);
    pe.emitting = false;
    pe.maxParticles = 100;
    pe.onAwake!();

    pe.burst(25);
    // Simulate to count alive
    pe.onUpdate!(0);
    expect(pe.aliveCount).toBe(25);
  });

  it('respects maxParticles limit', () => {
    const go = new GameObject('Emitter');
    go.transform.updateWorldMatrix();
    scene.add(go);

    const pe = go.addComponent(ParticleEmitter);
    pe.emissionRate = 1000;
    pe.maxParticles = 10;
    pe.lifetimeMin = 10;
    pe.lifetimeMax = 10;
    pe.onAwake!();

    pe.onUpdate!(1);
    expect(pe.aliveCount).toBeLessThanOrEqual(10);
  });

  it('particles spawn at gameobject world position', () => {
    const go = new GameObject('Emitter');
    go.transform.setPosition(5, 10, 15);
    go.transform.updateWorldMatrix();
    scene.add(go);

    const pe = go.addComponent(ParticleEmitter);
    pe.emissionRate = 100;
    pe.maxParticles = 10;
    pe.speedMin = 0;
    pe.speedMax = 0;
    pe.gravity = 0;
    pe.onAwake!();

    pe.onUpdate!(0.1);
    expect(pe.aliveCount).toBeGreaterThan(0);

    // Verify particles are at emitter position (speed=0, gravity=0)
    const pool = pe.pool!;
    for (let i = 0; i < pool.maxParticles; i++) {
      const p = pool.particles[i]!;
      if (!p.alive) continue;
      expect(p.x).toBe(5);
      expect(p.y).toBe(10);
      expect(p.z).toBe(15);
    }
  });

  it('cleans up pool on destroy', () => {
    const go = new GameObject('Emitter');
    const pe = go.addComponent(ParticleEmitter);
    pe.onAwake!();
    expect(pe.pool).not.toBeNull();

    pe.onDestroy!();
    expect(pe.pool).toBeNull();
  });
});
