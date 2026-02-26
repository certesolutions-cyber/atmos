import { Component, Input } from "@certe/atmos-core";
import type { GameObject, PropertyDef } from "@certe/atmos-core";
import { HingeJoint, RigidBody } from "@certe/atmos-physics";

/**
 * Rear-wheel-drive with open differential.
 *
 * Attach to the car body. Drag left/right rear wheel GameObjects
 * into the inspector refs. The script finds each wheel's HingeJoint
 * and distributes motor torque through a simple differential:
 *
 *   τ_left + τ_right = totalTorque
 *   Torque biased toward the slower wheel (limited-slip ratio).
 */
export class Drive extends Component {
  static editorProperties: PropertyDef[] = [
    { key: "leftWheel", type: "gameObjectRef" },
    { key: "rightWheel", type: "gameObjectRef" },
    { key: "maxTorque", type: "number", min: 1, max: 50000, step: 10 },
    { key: "maxSpeed", type: "number", min: 1, max: 200, step: 1 },
    { key: "lsdRatio", type: "number", min: 1, max: 5, step: 0.1 },
    { key: "brakeTorque", type: "number", min: 0, max: 50000, step: 100 },
    { key: "coastBrake", type: "number", min: 0, max: 5000, step: 10 },
  ];

  leftWheel: GameObject | null = null;
  rightWheel: GameObject | null = null;

  /** Total drive torque (N·m) split across both wheels */
  maxTorque = 2000;
  /** Target wheel angular velocity (rad/s) at full throttle */
  maxSpeed = 40;
  /** Limited-slip ratio: 1 = open diff, higher = more locking */
  lsdRatio = 1.5;
  /** Brake torque applied when braking (ArrowDown while moving forward) */
  brakeTorque = 5000;
  /** Rolling resistance / engine braking when coasting (no input) */
  coastBrake = 100;

  private _jointL: HingeJoint | null = null;
  private _jointR: HingeJoint | null = null;
  private _rbL: RigidBody | null = null;
  private _rbR: RigidBody | null = null;

  onStart(): void {
    if (this.leftWheel) {
      this._jointL = this.leftWheel.getComponent(HingeJoint);
      this._rbL = this.leftWheel.getComponent(RigidBody);
    }
    if (this.rightWheel) {
      this._jointR = this.rightWheel.getComponent(HingeJoint);
      this._rbR = this.rightWheel.getComponent(RigidBody);
    }
    // Start with motors off — enabled only when throttle/brake is applied
    this._setMotorsEnabled(false);
  }

  onUpdate(_dt: number): void {
    if (!Input.current) return;
    if (!this._jointL || !this._jointR) return;

    // Read input
    let throttle = 0;
    if (Input.current.getKey("ArrowUp")) throttle = 1;
    if (Input.current.getKey("ArrowDown")) throttle = -1;

    // Read wheel angular velocities along hinge axis
    const wL = this._wheelSpeed(this._rbL);
    const wR = this._wheelSpeed(this._rbR);

    // Determine if braking (throttle opposes current average velocity)
    const avgSpeed = (wL + wR) * 0.5;
    const braking =
      throttle !== 0 &&
      Math.sign(throttle) !== Math.sign(avgSpeed) &&
      Math.abs(avgSpeed) > 1;

    if (braking) {
      // Apply equal brake torque to both wheels (target=0 to slow down)
      this._setMotors(
        true,
        0,
        this.brakeTorque * 0.5,
        0,
        this.brakeTorque * 0.5,
      );
      return;
    }

    if (throttle === 0) {
      // Coast — use motor targeting zero velocity with small force to simulate
      // engine braking / rolling resistance. Angular damping on the body doesn't
      // work here because the hinge joint constraint overrides it.
      const coast = this.coastBrake * 0.5;
      this._setMotors(true, 0, coast, 0, coast);
      return;
    }

    // --- Differential torque split ---
    const targetSpeed = throttle * this.maxSpeed;
    const dirFactor = Math.sign(targetSpeed) > 0 ? 1 : 0.2; // Less torque in reverse for easier control
    const halfTorque = this.maxTorque * 0.5 * dirFactor;

    // Open diff: equal torque. LSD: bias toward slower wheel.
    let torqueL = halfTorque;
    let torqueR = halfTorque;

    if (this.lsdRatio > 1) {
      const absL = Math.abs(wL);
      const absR = Math.abs(wR);
      const faster = Math.max(absL, absR, 0.01);
      const slower = Math.min(absL, absR);
      const slip = faster / Math.max(slower, 0.01);

      if (slip > this.lsdRatio) {
        // One wheel spinning too fast — send more torque to slower one
        const bias = Math.min((slip - 1) / (this.lsdRatio - 1), 2) * 0.3;
        if (absL > absR) {
          torqueL = halfTorque * (1 - bias);
          torqueR = halfTorque * (1 + bias);
        } else {
          torqueL = halfTorque * (1 + bias);
          torqueR = halfTorque * (1 - bias);
        }
      }
    }

    this._setMotors(true, targetSpeed, torqueL, targetSpeed, torqueR);
  }

  /** Enable/disable motors on both wheels. */
  private _setMotorsEnabled(on: boolean): void {
    if (this._jointL) this._jointL.motorEnabled = on;
    if (this._jointR) this._jointR.motorEnabled = on;
  }

  /** Enable motors and set target velocity + max force for each wheel. */
  private _setMotors(
    enable: boolean,
    velL: number,
    forceL: number,
    velR: number,
    forceR: number,
  ): void {
    if (this._jointL) {
      this._jointL.motorEnabled = enable;
      this._jointL.motorMode = "velocity";
      this._jointL.motorTargetVelocity = velL;
      this._jointL.motorMaxForce = forceL;
    }
    if (this._jointR) {
      this._jointR.motorEnabled = enable;
      this._jointR.motorMode = "velocity";
      this._jointR.motorTargetVelocity = velR;
      this._jointR.motorMaxForce = forceR;
    }
  }

  private _wheelSpeed(rb: RigidBody | null): number {
    if (!rb?.body) return 0;
    const av = rb.body.angvel();
    // Project angular velocity onto world Y axis (hinge axis for vertical wheels)
    return av.y;
  }
}
