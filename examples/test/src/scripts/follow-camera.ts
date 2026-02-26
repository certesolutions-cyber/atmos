import { Component } from "@atmos/core";
import type { GameObject, PropertyDef } from "@atmos/core";
import { Vec3, Quat } from "@atmos/math";
import type { Vec3Type, QuatType } from "@atmos/math";

// Scratch arrays — zero alloc in hot path
const _targetPos: Vec3Type = Vec3.create();
const _desiredPos: Vec3Type = Vec3.create();
const _currentPos: Vec3Type = Vec3.create();
const _lookDir: Vec3Type = Vec3.create();
const _up: Vec3Type = Vec3.fromValues(0, 1, 0);
const _right: Vec3Type = Vec3.create();
const _forward: Vec3Type = Vec3.create();
const _desiredRot: QuatType = Quat.create();
const _offsetRot: QuatType = Quat.create();
const _tmpQuat: QuatType = Quat.create();
const _offsetVec: Vec3Type = Vec3.create();
const _pitchAxis: Vec3Type = Vec3.fromValues(1, 0, 0);
const _orthoUp: Vec3Type = Vec3.create();

/**
 * Drone-style follow camera.
 *
 * Attach to a camera GameObject. Drag the target into the inspector.
 * The camera follows the target with a configurable offset and
 * smoothly rotates to look at it, with adjustable pitch/yaw offset
 * for cinematic angles.
 */
export class FollowCamera extends Component {
  static editorProperties: PropertyDef[] = [
    { key: "target", type: "gameObjectRef" },
    { key: "distance", type: "number", min: 1, max: 100, step: 0.5 },
    { key: "height", type: "number", min: -20, max: 50, step: 0.5 },
    { key: "lateralOffset", type: "number", min: -20, max: 20, step: 0.5 },
    { key: "pitchOffset", type: "number", min: -80, max: 80, step: 1 },
    { key: "yawOffset", type: "number", min: -180, max: 180, step: 1 },
    { key: "followSmooth", type: "number", min: 0.5, max: 30, step: 0.5 },
    { key: "lookSmooth", type: "number", min: 0.5, max: 30, step: 0.5 },
  ];

  /** Target to follow */
  target: GameObject | null = null;

  /** Distance behind the target */
  distance = 8;
  /** Height above the target */
  height = 4;
  /** Lateral (sideways) offset from behind the target */
  lateralOffset = 0;

  /** Additional pitch angle in degrees (positive = look down) */
  pitchOffset = 10;
  /** Additional yaw angle in degrees (positive = orbit right) */
  yawOffset = 0;

  /** Position smoothing speed (higher = snappier) */
  followSmooth = 5;
  /** Rotation smoothing speed (higher = snappier) */
  lookSmooth = 4;

  onUpdate(dt: number): void {
    if (!this.target) return;

    const t = this.target.transform;
    t.updateWorldMatrix();
    const wm = t.worldMatrix;

    // Target world position
    Vec3.set(_targetPos, wm[12]!, wm[13]!, wm[14]!);

    // Target forward (local -Z in world space)
    const sx = Math.sqrt(wm[0]! * wm[0]! + wm[1]! * wm[1]! + wm[2]! * wm[2]!) || 1;
    const sz = Math.sqrt(wm[8]! * wm[8]! + wm[9]! * wm[9]! + wm[10]! * wm[10]!) || 1;
    Vec3.set(_forward, -wm[8]! / sz, -wm[9]! / sz, -wm[10]! / sz);
    Vec3.set(_right, wm[0]! / sx, wm[1]! / sx, wm[2]! / sx);

    // Apply yaw offset: rotate the "behind" direction around world Y
    const yawRad = (this.yawOffset * Math.PI) / 180;
    Quat.fromAxisAngle(_offsetRot, _up, yawRad);

    // Behind direction = -forward (the direction behind the target)
    Vec3.set(_offsetVec, -_forward[0]!, -_forward[1]!, -_forward[2]!);
    Vec3.transformQuat(_offsetVec, _offsetVec, _offsetRot);

    // Desired position = target + behind * distance + up * height + right * lateral
    Vec3.scale(_desiredPos, _offsetVec, this.distance);
    _desiredPos[0]! += _targetPos[0]!;
    _desiredPos[1]! += _targetPos[1]! + this.height;
    _desiredPos[2]! += _targetPos[2]!;

    // Apply lateral offset (perpendicular to behind direction on XZ plane)
    Vec3.cross(_right, _up, _offsetVec);
    Vec3.normalize(_right, _right);
    _desiredPos[0] += _right[0]! * this.lateralOffset;
    _desiredPos[1] += _right[1]! * this.lateralOffset;
    _desiredPos[2] += _right[2]! * this.lateralOffset;

    // Smooth position
    const cam = this.gameObject.transform;
    Vec3.copy(_currentPos, cam.position);
    const posT = Math.min(this.followSmooth * dt, 1);
    Vec3.lerp(_currentPos, _currentPos, _desiredPos, posT);
    cam.setPosition(_currentPos[0]!, _currentPos[1]!, _currentPos[2]!);

    // Look direction toward target
    Vec3.sub(_lookDir, _targetPos, _currentPos);
    const len = Vec3.length(_lookDir);
    if (len < 0.001) return;
    Vec3.scale(_lookDir, _lookDir, 1 / len);

    // Build look-at quaternion
    lookRotation(_desiredRot, _lookDir, _up);

    // Apply pitch offset
    const pitchRad = (this.pitchOffset * Math.PI) / 180;
    Quat.fromAxisAngle(_tmpQuat, _pitchAxis, pitchRad);
    Quat.multiply(_desiredRot, _desiredRot, _tmpQuat);

    // Smooth rotation via slerp
    const rotT = Math.min(this.lookSmooth * dt, 1);
    Quat.slerp(_desiredRot, cam.rotation, _desiredRot, rotT);
    Quat.normalize(_desiredRot, _desiredRot);
    cam.setRotationFrom(_desiredRot);
  }
}

/**
 * Compute a quaternion that orients -Z along `forward` and +Y close to `up`.
 * Similar to Unity's Quaternion.LookRotation.
 */
function lookRotation(out: QuatType, fwd: Vec3Type, up: Vec3Type): QuatType {
  // Right = normalize(cross(up, forward))
  Vec3.cross(_right, up, fwd);
  const rLen = Vec3.length(_right);
  if (rLen < 0.0001) {
    // Degenerate — forward is parallel to up
    Quat.identity(out);
    return out;
  }
  Vec3.scale(_right, _right, 1 / rLen);

  // Recompute orthogonal up = cross(forward, right)
  Vec3.cross(_orthoUp, fwd, _right);

  // Build rotation matrix columns → quaternion
  // col0 = right, col1 = _orthoUp, col2 = forward
  const m00 = _right[0]!, m01 = _orthoUp[0]!, m02 = fwd[0]!;
  const m10 = _right[1]!, m11 = _orthoUp[1]!, m12 = fwd[1]!;
  const m20 = _right[2]!, m21 = _orthoUp[2]!, m22 = fwd[2]!;
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out[3] = 0.25 / s;
    out[0] = (m21 - m12) * s;
    out[1] = (m02 - m20) * s;
    out[2] = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    out[3] = (m21 - m12) / s;
    out[0] = 0.25 * s;
    out[1] = (m01 + m10) / s;
    out[2] = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    out[3] = (m02 - m20) / s;
    out[0] = (m01 + m10) / s;
    out[1] = 0.25 * s;
    out[2] = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    out[3] = (m10 - m01) / s;
    out[0] = (m02 + m20) / s;
    out[1] = (m12 + m21) / s;
    out[2] = 0.25 * s;
  }

  return out;
}
