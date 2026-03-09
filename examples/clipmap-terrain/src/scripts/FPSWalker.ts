/**
 * First-person walker for clipmap terrain.
 * - WASD: move, Mouse (pointer lock): look, Space: jump
 * - Terrain collision via heightFn query at player feet
 */

import { Component, Input } from "@certe/atmos-core";
import { Vec3, Quat } from "@certe/atmos-math";
import type { Vec3Type, QuatType } from "@certe/atmos-math";
import type { HeightFn } from "@certe/atmos-clipmap-terrain";
import { terrainHeight } from "./ProceduralTerrain.js";

export class FPSWalker extends Component {
  moveSpeed = 20.0;
  lookSpeed = 0.002;
  gravity = 20.0;
  jumpSpeed = 8.0;
  eyeHeight = 1.7;
  /** Height function for terrain query. Defaults to ProceduralTerrain's. */
  heightFn: HeightFn = terrainHeight;

  /** Current yaw angle (radians). */
  yaw = 0;
  /** Current pitch angle (radians). */
  pitch = 0;
  private _velY = 0;
  private _grounded = false;

  // Scratch (zero-alloc)
  private readonly _forward: Vec3Type = Vec3.create();
  private readonly _right: Vec3Type = Vec3.create();
  private readonly _move: Vec3Type = Vec3.create();
  private readonly _rot: QuatType = Quat.create();
  private readonly _pitchQ: QuatType = Quat.create();
  private readonly _yAxis: Vec3Type = Vec3.fromValues(0, 1, 0);
  private readonly _xAxis: Vec3Type = Vec3.fromValues(1, 0, 0);

  private _onClick = () => {
    console.log("click");
    const canvas = document.querySelector("canvas");
    if (canvas && !document.pointerLockElement) {
      canvas.requestPointerLock();
      console.log("request pointer lock");
    }
  };

  onAwake(): void {
    this.yaw = 0;
    this.pitch = 0;
    this._velY = 0;
    this._grounded = false;

    // Snap to terrain on spawn
    const pos = this.gameObject.transform.position;
    const groundY = this.heightFn(pos[0]!, pos[2]!);
    this.gameObject.transform.setPosition(
      pos[0]!,
      groundY + this.eyeHeight,
      pos[2]!,
    );
  }

  onUpdate(dt: number): void {
    if (!Input.current) return;
    const t = this.gameObject.transform;

    // Mouse look (pointer locked)
    if (document.pointerLockElement) {
      this.yaw -= Input.current.mouseDelta.x * this.lookSpeed;
      this.pitch -= Input.current.mouseDelta.y * this.lookSpeed;
      this.pitch = Math.max(
        -Math.PI * 0.49,
        Math.min(Math.PI * 0.49, this.pitch),
      );
    }

    const pos = t.position;
    let px = pos[0]!;
    let py = pos[1]!;
    let pz = pos[2]!;

    // Horizontal movement (WASD)
    Vec3.set(this._forward, -Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    Vec3.set(this._right, Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    Vec3.set(this._move, 0, 0, 0);
    if (Input.current.getKey("KeyW"))
      Vec3.add(this._move, this._move, this._forward);
    if (Input.current.getKey("KeyS"))
      Vec3.sub(this._move, this._move, this._forward);
    if (Input.current.getKey("KeyD"))
      Vec3.add(this._move, this._move, this._right);
    if (Input.current.getKey("KeyA"))
      Vec3.sub(this._move, this._move, this._right);

    const hLen = Math.hypot(this._move[0]!, this._move[2]!);
    if (hLen > 0.001) {
      const speed = (this.moveSpeed * dt) / hLen;
      px += this._move[0]! * speed;
      pz += this._move[2]! * speed;
    }

    // Jump
    if (Input.current.getKey("Space") && this._grounded) {
      this._velY = this.jumpSpeed;
      this._grounded = false;
    }

    // Gravity
    this._velY -= this.gravity * dt;
    py += this._velY * dt;

    // Terrain hit test: query height at feet position
    const groundY = this.heightFn(px, pz);
    const feetY = py - this.eyeHeight;

    if (feetY <= groundY) {
      // On or below ground — snap to surface
      py = groundY + this.eyeHeight;
      if (this._velY < 0) this._velY = 0;
      this._grounded = true;
    } else {
      // Airborne — check if close enough to count as grounded
      this._grounded = feetY - groundY < 0.1;
      if (this._grounded && this._velY < 0) this._velY = 0;
    }

    // Apply position
    t.setPosition(px, py, pz);

    // Apply rotation (yaw + pitch)
    Quat.fromAxisAngle(this._rot, this._yAxis, this.yaw);
    Quat.fromAxisAngle(this._pitchQ, this._xAxis, this.pitch);
    Quat.multiply(this._rot, this._rot, this._pitchQ);
    Quat.normalize(this._rot, this._rot);
    t.setRotationFrom(this._rot);
  }

  onPlayStop(): void {
    window.removeEventListener("click", this._onClick);
  }

  onPlayStart(): void {
    window.addEventListener("click", this._onClick);
    console.log("register click");
  }
}
