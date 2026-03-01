import { Component } from '@certe/atmos-core';
import { ParticlePool } from './particle-pool.js';

/**
 * ParticleEmitter component — pure simulation, no GPU dependency.
 *
 * Attach to a GameObject. Configure emission, lifetime, velocity, color,
 * and size properties via the inspector or a sibling script component.
 * A sibling ParticleRenderer reads the simulation data for GPU drawing.
 */
export class ParticleEmitter extends Component {
  // --- Emission ---
  /** Particles emitted per second. */
  emissionRate = 10;
  /** Max particles alive at once. */
  maxParticles = 200;
  /** Whether the system is currently emitting. */
  emitting = true;

  // --- Lifetime ---
  /** Minimum lifetime in seconds. */
  lifetimeMin = 1;
  /** Maximum lifetime in seconds. */
  lifetimeMax = 2;

  // --- Velocity ---
  /** Initial speed minimum. */
  speedMin = 1;
  /** Initial speed maximum. */
  speedMax = 3;
  /** Spread cone angle in radians (0 = straight up, PI = sphere). */
  spread = 0.5;

  // --- Physics ---
  /** Gravity applied to particles (world-space Y). */
  gravity = -2;

  // --- Size ---
  /** Start size. */
  startSize = 0.2;
  /** End size (at death). */
  endSize = 0;

  // --- Color ---
  startColorR = 1;
  startColorG = 1;
  startColorB = 1;
  startAlpha = 1;
  endColorR = 1;
  endColorG = 0.5;
  endColorB = 0;
  endAlpha = 0;

  // --- Rotation ---
  rotationSpeedMin = 0;
  rotationSpeedMax = 0;

  // --- Internal ---
  private _pool: ParticlePool | null = null;
  private _emitAccumulator = 0;

  /** The particle pool — read by ParticleRenderer for GPU upload. */
  get pool(): ParticlePool | null {
    return this._pool;
  }

  get aliveCount(): number {
    return this._pool?.aliveCount ?? 0;
  }

  onAwake(): void {
    this._pool = new ParticlePool({ maxParticles: this.maxParticles });
  }

  onUpdate(dt: number): void {
    if (!this._pool) return;

    if (this.emitting) {
      this._emitAccumulator += this.emissionRate * dt;
      while (this._emitAccumulator >= 1) {
        this._emitAccumulator -= 1;
        this._emitOne();
      }
    }

    this._pool.simulate(dt, 0, this.gravity, 0);
  }

  onDestroy(): void {
    this._pool = null;
  }

  /** Emit a burst of N particles at once. */
  burst(count: number): void {
    for (let i = 0; i < count; i++) {
      this._emitOne();
    }
  }

  private _emitOne(): void {
    if (!this._pool) return;
    const p = this._pool.emit();
    if (!p) return;

    const world = this.gameObject.transform.worldMatrix;
    p.x = world[12]!;
    p.y = world[13]!;
    p.z = world[14]!;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * this.spread;
    const sinPhi = Math.sin(phi);
    const speed = this.speedMin + Math.random() * (this.speedMax - this.speedMin);
    p.vx = Math.cos(theta) * sinPhi * speed;
    p.vy = Math.cos(phi) * speed;
    p.vz = Math.sin(theta) * sinPhi * speed;

    p.lifetime = this.lifetimeMin + Math.random() * (this.lifetimeMax - this.lifetimeMin);

    p.startSize = this.startSize;
    p.endSize = this.endSize;
    p.size = this.startSize;

    p.startR = this.startColorR;
    p.startG = this.startColorG;
    p.startB = this.startColorB;
    p.startA = this.startAlpha;
    p.endR = this.endColorR;
    p.endG = this.endColorG;
    p.endB = this.endColorB;
    p.endA = this.endAlpha;

    p.r = p.startR;
    p.g = p.startG;
    p.b = p.startB;
    p.a = p.startA;

    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = this.rotationSpeedMin +
      Math.random() * (this.rotationSpeedMax - this.rotationSpeedMin);
  }
}
