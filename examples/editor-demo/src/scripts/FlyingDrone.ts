import { Component, Input } from "@atmos/core";
import type { PropertyDef } from "@atmos/core";
import { Vec3, Quat } from "@atmos/math";
import type { Vec3Type, QuatType } from "@atmos/math";

/**
 * Flying drone controller.
 * - Arrow keys: move forward/back/strafe left/right (relative to facing)
 * - Mouse drag: yaw rotation around Y axis
 * - Hovers with a gentle bob animation
 */
export class FlyingDrone extends Component {
  moveSpeed = 5.0;
  turnSpeed = 0.004;
  bobAmplitude = 0.15;
  bobFrequency = 2.0;
  hoverHeight = 2.0;

  static editorProperties: PropertyDef[] = [
    { key: "moveSpeed", type: "number", min: 0, max: 50, step: 0.5 },
    { key: "turnSpeed", type: "number", min: 0, max: 0.02, step: 0.001 },
    { key: "bobAmplitude", type: "number", min: 0, max: 1, step: 0.05 },
    { key: "bobFrequency", type: "number", min: 0, max: 10, step: 0.5 },
    { key: "hoverHeight", type: "number", min: 0, max: 20, step: 0.5 },
  ];

  private _yaw = 0;
  private _time = 0;
  private _startY = 0;

  // Pre-allocated temp buffers
  private readonly _forward: Vec3Type = Vec3.fromValues(0, 0, 0);
  private readonly _right: Vec3Type = Vec3.fromValues(0, 0, 0);
  private readonly _move: Vec3Type = Vec3.fromValues(0, 0, 0);
  private readonly _tmpQuat: QuatType = Quat.create();
  private readonly _yAxis: Vec3Type = Vec3.fromValues(0, 1, 0);

  onAwake(): void {
    this._yaw = 0;
    this._time = 0;

    const pos = this.gameObject.transform.position;
    this._startY = pos[1] ?? this.hoverHeight;
    if (this._startY === 0) this._startY = this.hoverHeight;
  }

  onUpdate(dt: number): void {
    if (!Input.current) return;
    this._time += dt;

    // Yaw from mouse drag (left button)
    if (Input.current.getMouseButton(0)) {
      this._yaw -= Input.current.mouseDelta.x * this.turnSpeed;
    }
    const t = this.gameObject.transform;

    // Yaw rotation (Y-axis only)
    Quat.fromAxisAngle(this._tmpQuat, this._yAxis, this._yaw);
    Quat.normalize(this._tmpQuat, this._tmpQuat);
    t.setRotationFrom(this._tmpQuat);

    // Forward = local -Z rotated by yaw
    Vec3.set(this._forward, -Math.sin(this._yaw), 0, -Math.cos(this._yaw));
    // Right = local +X rotated by yaw
    Vec3.set(this._right, Math.cos(this._yaw), 0, -Math.sin(this._yaw));

    // Accumulate movement from arrow keys
    Vec3.set(this._move, 0, 0, 0);
    if (Input.current.getKey("ArrowUp")) {
      Vec3.add(this._move, this._move, this._forward);
    }
    if (Input.current.getKey("ArrowDown")) {
      Vec3.sub(this._move, this._move, this._forward);
    }
    if (Input.current.getKey("ArrowRight")) {
      Vec3.add(this._move, this._move, this._right);
    }
    if (Input.current.getKey("ArrowLeft")) {
      Vec3.sub(this._move, this._move, this._right);
    }

    // Normalize if moving diagonally
    const len = Math.hypot(this._move[0]!, this._move[2]!);
    if (len > 0.001) {
      Vec3.scale(this._move, this._move, (this.moveSpeed * dt) / len);
      t.setPosition(
        t.position[0]! + this._move[0]!,
        t.position[1]!,
        t.position[2]! + this._move[2]!,
      );
    }

    // Hover bob
    const bobY =
      this._startY +
      Math.sin(this._time * this.bobFrequency) * this.bobAmplitude;
    t.setPosition(t.position[0]!, bobY, t.position[2]!);
  }
}
