/**
 * CPU-side particle pool with fixed-capacity ring buffer.
 *
 * Each particle has position, velocity, color, size, lifetime etc.
 * The pool handles allocation, simulation, and packing into a
 * Float32Array ready for GPU upload.
 */

import { PARTICLE_STRIDE_BYTES } from './particle-shader.js';

export interface ParticleConfig {
  /** Max particles alive at once. */
  maxParticles: number;
}

/** Per-particle CPU state. */
export interface Particle {
  alive: boolean;
  age: number;
  lifetime: number;

  // Position
  x: number;
  y: number;
  z: number;

  // Velocity
  vx: number;
  vy: number;
  vz: number;

  // Visual
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  rotation: number;
  rotationSpeed: number;

  // Start values (for interpolation)
  startR: number;
  startG: number;
  startB: number;
  startA: number;
  startSize: number;
  endR: number;
  endG: number;
  endB: number;
  endA: number;
  endSize: number;
}

const STRIDE_FLOATS = PARTICLE_STRIDE_BYTES / 4; // 12 floats per particle

export class ParticlePool {
  readonly maxParticles: number;
  readonly particles: Particle[];
  private _aliveCount = 0;

  /** Packed GPU data: position(3) + size(1) + color(4) + rotation(1) + pad(3) = 12 floats each */
  readonly gpuData: Float32Array;

  get aliveCount(): number {
    return this._aliveCount;
  }

  constructor(config: ParticleConfig) {
    this.maxParticles = config.maxParticles;
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(createDeadParticle());
    }
    this.gpuData = new Float32Array(this.maxParticles * STRIDE_FLOATS);
  }

  /** Find a dead particle slot, or return null if pool is full. */
  emit(): Particle | null {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]!;
      if (!p.alive) {
        p.alive = true;
        p.age = 0;
        return p;
      }
    }
    return null;
  }

  /** Simulate all alive particles and pack GPU data. Returns alive count. */
  simulate(dt: number, gravityX: number, gravityY: number, gravityZ: number): number {
    let alive = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]!;
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.lifetime) {
        p.alive = false;
        continue;
      }

      // Physics
      p.vx += gravityX * dt;
      p.vy += gravityY * dt;
      p.vz += gravityZ * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rotation += p.rotationSpeed * dt;

      // Interpolate color and size over lifetime
      const t = p.age / p.lifetime;
      p.r = p.startR + (p.endR - p.startR) * t;
      p.g = p.startG + (p.endG - p.startG) * t;
      p.b = p.startB + (p.endB - p.startB) * t;
      p.a = p.startA + (p.endA - p.startA) * t;
      p.size = p.startSize + (p.endSize - p.startSize) * t;

      // Pack into GPU buffer
      const offset = alive * STRIDE_FLOATS;
      this.gpuData[offset] = p.x;
      this.gpuData[offset + 1] = p.y;
      this.gpuData[offset + 2] = p.z;
      this.gpuData[offset + 3] = p.size;
      this.gpuData[offset + 4] = p.r;
      this.gpuData[offset + 5] = p.g;
      this.gpuData[offset + 6] = p.b;
      this.gpuData[offset + 7] = p.a;
      this.gpuData[offset + 8] = p.rotation;
      this.gpuData[offset + 9] = 0; // pad
      this.gpuData[offset + 10] = 0;
      this.gpuData[offset + 11] = 0;

      alive++;
    }

    this._aliveCount = alive;
    return alive;
  }
}

function createDeadParticle(): Particle {
  return {
    alive: false, age: 0, lifetime: 1,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    r: 1, g: 1, b: 1, a: 1,
    size: 0.1, rotation: 0, rotationSpeed: 0,
    startR: 1, startG: 1, startB: 1, startA: 1, startSize: 0.1,
    endR: 1, endG: 1, endB: 1, endA: 0, endSize: 0,
  };
}
