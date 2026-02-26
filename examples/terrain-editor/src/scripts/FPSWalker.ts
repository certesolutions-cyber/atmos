import { Component, Input } from '@atmos/core';
import type { PropertyDef } from '@atmos/core';
import { Vec3, Quat } from '@atmos/math';
import type { Vec3Type, QuatType } from '@atmos/math';
import { terrainDensity } from './terrain-density.js';

/**
 * First-person walker that follows terrain surface via density field.
 * - WASD: move forward/back/strafe
 * - Mouse (pointer lock): look around
 * - Space: jump
 * - Grounding: density test at feet + gradient push when inside solid
 * - Gravity when airborne
 */
export class FPSWalker extends Component {
  moveSpeed = 8.0;
  lookSpeed = 0.002;
  gravity = 20.0;
  jumpSpeed = 8.0;
  /** Height of the "eyes" above the foot contact point. */
  eyeHeight = 1.7;
  /** Small epsilon for gradient central differences. */
  gradientEps = 0.3;
  /** How strongly feet are pushed out of solid per frame. */
  pushStrength = 60.0;

  static editorProperties: PropertyDef[] = [
    { key: 'moveSpeed', type: 'number', min: 0, max: 50, step: 0.5 },
    { key: 'lookSpeed', type: 'number', min: 0, max: 0.01, step: 0.0005 },
    { key: 'gravity', type: 'number', min: 0, max: 60, step: 1 },
    { key: 'jumpSpeed', type: 'number', min: 0, max: 20, step: 0.5 },
    { key: 'eyeHeight', type: 'number', min: 0.5, max: 3, step: 0.1 },
  ];

  private _yaw = 0;
  private _pitch = 0;
  private _velY = 0;
  private _grounded = false;

  // Scratch
  private readonly _forward: Vec3Type = Vec3.create();
  private readonly _right: Vec3Type = Vec3.create();
  private readonly _move: Vec3Type = Vec3.create();
  private readonly _rot: QuatType = Quat.create();
  private readonly _pitchQ: QuatType = Quat.create();
  private readonly _yAxis: Vec3Type = Vec3.fromValues(0, 1, 0);
  private readonly _xAxis: Vec3Type = Vec3.fromValues(1, 0, 0);

  // Pointer lock request (click to lock)
  private _onClick = () => {
    const canvas = document.querySelector('canvas');
    if (canvas && !document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  };

  onAwake(): void {
    this._yaw = 0;
    this._pitch = 0;
    this._velY = 0;
    this._grounded = false;

    window.addEventListener('click', this._onClick);
  }

  onUpdate(dt: number): void {
    if (!Input.current) return;
    const t = this.gameObject.transform;

    // Mouse look (only when pointer is locked)
    if (document.pointerLockElement) {
      this._yaw -= Input.current.mouseDelta.x * this.lookSpeed;
      this._pitch -= Input.current.mouseDelta.y * this.lookSpeed;
      this._pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this._pitch));
    }
    const pos = t.position;
    let px = pos[0]!;
    let py = pos[1]!;
    let pz = pos[2]!;

    // --- Horizontal movement (WASD) ---
    Vec3.set(this._forward, -Math.sin(this._yaw), 0, -Math.cos(this._yaw));
    Vec3.set(this._right, Math.cos(this._yaw), 0, -Math.sin(this._yaw));

    Vec3.set(this._move, 0, 0, 0);
    if (Input.current.getKey('KeyW')) Vec3.add(this._move, this._move, this._forward);
    if (Input.current.getKey('KeyS')) Vec3.sub(this._move, this._move, this._forward);
    if (Input.current.getKey('KeyD')) Vec3.add(this._move, this._move, this._right);
    if (Input.current.getKey('KeyA')) Vec3.sub(this._move, this._move, this._right);

    const hLen = Math.hypot(this._move[0]!, this._move[2]!);
    if (hLen > 0.001) {
      const speed = this.moveSpeed * dt / hLen;
      px += this._move[0]! * speed;
      pz += this._move[2]! * speed;
    }

    // --- Jump ---
    if (Input.current.getKey('Space') && this._grounded) {
      this._velY = this.jumpSpeed;
      this._grounded = false;
    }

    // --- Gravity ---
    this._velY -= this.gravity * dt;
    py += this._velY * dt;

    // --- Terrain collision via density ---
    const feetY = py - this.eyeHeight;
    const density = terrainDensity(px, feetY, pz);

    if (density < 0) {
      // Inside solid — compute gradient to find "up" direction
      const eps = this.gradientEps;
      const fn = terrainDensity;
      const gx = fn(px + eps, feetY, pz) - fn(px - eps, feetY, pz);
      const gy = fn(px, feetY + eps, pz) - fn(px, feetY - eps, pz);
      const gz = fn(px, feetY, pz + eps) - fn(px, feetY, pz - eps);
      const glen = Math.sqrt(gx * gx + gy * gy + gz * gz);

      if (glen > 1e-6) {
        // Push out along gradient. Scale penetration by gradient magnitude
        // so push distance is in world units regardless of density scale.
        const penetration = -density / glen;
        const push = Math.min(penetration, this.pushStrength * dt);
        const inv = push / glen;
        px += gx * inv;
        py += gy * inv;
        pz += gz * inv;
      }

      // If gradient points mostly up, we're grounded
      if (glen > 1e-6 && (gy / glen) > 0.5) {
        this._grounded = true;
        if (this._velY < 0) this._velY = 0;
      }
    } else {
      // Above surface — estimate world distance using gradient magnitude
      const eps = this.gradientEps;
      const fn = terrainDensity;
      const gy = fn(px, feetY + eps, pz) - fn(px, feetY - eps, pz);
      const gradY = gy / (2 * eps);
      // density / |gradY| ≈ distance in world units above surface
      const approxDist = Math.abs(gradY) > 1e-6 ? density / Math.abs(gradY) : density * 20;
      this._grounded = approxDist < 0.3;
      if (this._grounded && this._velY < 0) {
        this._velY = 0;
      }
    }

    // --- Apply position ---
    t.setPosition(px, py, pz);

    // --- Apply rotation (yaw + pitch) ---
    Quat.fromAxisAngle(this._rot, this._yAxis, this._yaw);
    Quat.fromAxisAngle(this._pitchQ, this._xAxis, this._pitch);
    Quat.multiply(this._rot, this._rot, this._pitchQ);
    Quat.normalize(this._rot, this._rot);
    t.setRotationFrom(this._rot);
  }

  onDestroy(): void {
    window.removeEventListener('click', this._onClick);
  }
}
