import { Component, Input } from "@atmos/core";
import type { PropertyDef } from "@atmos/core";
import { HingeJoint } from "@atmos/physics";

export class Steer extends Component {
  /** Properties exposed in the editor inspector */
  static editorProperties: PropertyDef[] = [
    { key: "maxAngle", type: "number", min: 5, max: 45, step: 1 },
    { key: "steerSpeed", type: "number", min: 1, max: 50, step: 0.5 },
    { key: "stiffness", type: "number", min: 200, max: 50000, step: 10 },
    { key: "damping", type: "number", min: 1, max: 2000, step: 1 },
  ];

  maxAngle = 30;
  steerSpeed = 5;
  stiffness = 1000;
  damping = 100;

  private _joint: HingeJoint | null = null;
  private _currentAngle = 0;

  onStart(): void {
    this._joint = this.gameObject.getComponent(HingeJoint);
    if (this._joint) {
      this._joint.limitsEnabled = false;
      this._joint.motorEnabled = true;
      this._joint.motorMode = "position";
      this._joint.motorStiffness = this.stiffness;
      this._joint.motorDamping = this.damping;
    }
  }

  onUpdate(dt: number): void {
    if (!this._joint || !Input.current) return;

    const maxRad = (this.maxAngle * Math.PI) / 180;
    let target = 0;
    if (Input.current.getKey("ArrowLeft")) target = -maxRad;
    if (Input.current.getKey("ArrowRight")) target = maxRad;

    // Smooth interpolation toward target
    const speed = this.steerSpeed * dt;
    this._currentAngle += (target - this._currentAngle) * Math.min(speed, 1);

    this._joint.motorStiffness = this.stiffness;
    this._joint.motorDamping = this.damping;
    this._joint.motorTargetPosition = this._currentAngle;
  }
}
