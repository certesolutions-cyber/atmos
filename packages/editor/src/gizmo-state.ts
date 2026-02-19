import type { GameObject } from '@atmos/core';
import { Mat4, Quat, Ray, Vec3 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { CameraSettings } from '@atmos/renderer';

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GizmoAxis = 'x' | 'y' | 'z' | null;

// Pre-allocated scratch data
const _ray = Ray.create();
const _viewMatrix: Mat4Type = Mat4.create();
const _projMatrix: Mat4Type = Mat4.create();
const _vpMatrix: Mat4Type = Mat4.create();
const _invVP: Mat4Type = Mat4.create();
const _planeHit = Vec3.create();
const _deltaQuat = Quat.create();

const AXIS_HIT_RADIUS = 0.2;
const SCALE_HIT_RADIUS = 0.35;
const RING_HIT_TOLERANCE = 0.2;
const GIZMO_LENGTH = 1.0;
const RING_RADIUS = 1.0;

function buildRay(
  sx: number, sy: number,
  camera: CameraSettings, canvas: HTMLCanvasElement,
): boolean {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return false;

  const aspect = w / h;
  Mat4.perspective(_projMatrix, camera.fovY, aspect, camera.near, camera.far);
  Mat4.lookAt(_viewMatrix, camera.eye, camera.target, camera.up);
  Mat4.multiply(_vpMatrix, _projMatrix, _viewMatrix);
  if (!Mat4.invert(_invVP, _vpMatrix)) return false;
  Ray.fromScreenCoords(_ray, sx, sy, w, h, _invVP);
  return true;
}

/**
 * Closest-approach between the ray and an axis line through `origin`.
 * Returns the axis parameter `s` (distance along axis from origin).
 */
function projectOnAxis(
  ray: typeof _ray,
  origin: Float32Array,
  axisDir: Float32Array,
): number {
  const ox = ray.origin[0]! - origin[0]!;
  const oy = ray.origin[1]! - origin[1]!;
  const oz = ray.origin[2]! - origin[2]!;

  const dx = ray.direction[0]!, dy = ray.direction[1]!, dz = ray.direction[2]!;
  const ax = axisDir[0]!, ay = axisDir[1]!, az = axisDir[2]!;

  const dotDA = dx * ax + dy * ay + dz * az;
  const dotDD = dx * dx + dy * dy + dz * dz;
  const dotOA = ox * ax + oy * ay + oz * az;
  const dotOD = ox * dx + oy * dy + oz * dz;

  const denom = dotDD - dotDA * dotDA;
  if (Math.abs(denom) < 1e-8) return 0;

  const t = (dotDA * dotOA - dotOD) / denom;
  return dotOA + t * dotDA;
}

/**
 * Compute the minimum distance between a ray and an axis line at parameter s.
 */
function axisRayDistance(
  ray: typeof _ray,
  origin: Float32Array,
  axisDir: Float32Array,
  s: number,
): number {
  const px = origin[0]! + axisDir[0]! * s;
  const py = origin[1]! + axisDir[1]! * s;
  const pz = origin[2]! + axisDir[2]! * s;

  const toPointX = px - ray.origin[0]!;
  const toPointY = py - ray.origin[1]!;
  const toPointZ = pz - ray.origin[2]!;
  const tRay = toPointX * ray.direction[0]! + toPointY * ray.direction[1]! + toPointZ * ray.direction[2]!;

  const hitX = ray.origin[0]! + ray.direction[0]! * tRay - px;
  const hitY = ray.origin[1]! + ray.direction[1]! * tRay - py;
  const hitZ = ray.origin[2]! + ray.direction[2]! * tRay - pz;
  return Math.sqrt(hitX * hitX + hitY * hitY + hitZ * hitZ);
}

/**
 * Intersect _ray with the plane perpendicular to axisVec through origin.
 * Writes the in-plane offset from origin into _planeHit.
 * Returns t >= 0, or -1 on miss (parallel / behind).
 */
function intersectAxisPlane(
  origin: Float32Array,
  axisVec: Float32Array,
): number {
  const d = axisVec[0]! * origin[0]! + axisVec[1]! * origin[1]! + axisVec[2]! * origin[2]!;
  const t = Ray.intersectPlane(_ray, axisVec, d);
  if (t < 0) return -1;

  _planeHit[0] = _ray.origin[0]! + _ray.direction[0]! * t - origin[0]!;
  _planeHit[1] = _ray.origin[1]! + _ray.direction[1]! * t - origin[1]!;
  _planeHit[2] = _ray.origin[2]! + _ray.direction[2]! * t - origin[2]!;
  return t;
}

/** Polar angle of _planeHit in the plane perpendicular to axis. */
function planeAngle(axisKey: string): number {
  if (axisKey === 'x') return Math.atan2(_planeHit[2]!, _planeHit[1]!);
  if (axisKey === 'y') return Math.atan2(_planeHit[0]!, _planeHit[2]!);
  return Math.atan2(_planeHit[1]!, _planeHit[0]!); // z
}

const _axisVecs: Record<string, Float32Array> = {
  x: Vec3.fromValues(1, 0, 0),
  y: Vec3.fromValues(0, 1, 0),
  z: Vec3.fromValues(0, 0, 1),
};

export class GizmoState {
  mode: GizmoMode = 'translate';
  activeAxis: GizmoAxis = null;
  dragging = false;
  snapSize = 1.0;
  snapEnabled = false;

  private _startValue = 0;
  private _startAngle = 0;
  private _startPos = Vec3.create();
  private _startRot = new Float32Array(4);
  private _startScale = Vec3.create();
  private _startWorldOrigin = Vec3.create();

  hitTest(
    screenX: number, screenY: number,
    camera: CameraSettings, canvas: HTMLCanvasElement,
    target: GameObject, gizmoScale: number,
  ): GizmoAxis {
    if (!buildRay(screenX, screenY, camera, canvas)) return null;

    const pos = target.transform.worldMatrix;
    const origin = Vec3.fromValues(pos[12]!, pos[13]!, pos[14]!);

    if (this.mode === 'rotate') {
      return this._hitTestRing(origin, gizmoScale);
    }
    return this._hitTestAxis(origin, gizmoScale);
  }

  private _hitTestAxis(origin: Float32Array, gizmoScale: number): GizmoAxis {
    let bestAxis: GizmoAxis = null;
    let bestDist = Infinity;

    for (const axis of ['x', 'y', 'z'] as const) {
      const axisVec = _axisVecs[axis]!;
      const scaledLen = GIZMO_LENGTH * gizmoScale;

      const s = projectOnAxis(_ray, origin, axisVec);
      if (s < 0 || s > scaledLen) continue;

      const dist = axisRayDistance(_ray, origin, axisVec, s);
      const radius = this.mode === 'scale' ? SCALE_HIT_RADIUS : AXIS_HIT_RADIUS;
      const hitThreshold = radius * gizmoScale;
      if (dist < hitThreshold && dist < bestDist) {
        bestDist = dist;
        bestAxis = axis;
      }
    }

    return bestAxis;
  }

  private _hitTestRing(origin: Float32Array, gizmoScale: number): GizmoAxis {
    let bestAxis: GizmoAxis = null;
    let bestDelta = Infinity;
    const ringRadius = RING_RADIUS * gizmoScale;
    const tolerance = RING_HIT_TOLERANCE * gizmoScale;

    for (const axis of ['x', 'y', 'z'] as const) {
      const axisVec = _axisVecs[axis]!;
      if (intersectAxisPlane(origin, axisVec) < 0) continue;

      const hitDist = Vec3.length(_planeHit);
      const ringDelta = Math.abs(hitDist - ringRadius);
      if (ringDelta < tolerance && ringDelta < bestDelta) {
        bestDelta = ringDelta;
        bestAxis = axis;
      }
    }

    return bestAxis;
  }

  beginDrag(
    axis: GizmoAxis,
    screenX: number, screenY: number,
    camera: CameraSettings, canvas: HTMLCanvasElement,
    target: GameObject, gizmoScale: number,
  ): void {
    if (!axis) return;
    this.activeAxis = axis;
    this.dragging = true;

    if (!buildRay(screenX, screenY, camera, canvas)) return;

    // Save world origin — use this throughout the drag to avoid feedback
    const pos = target.transform.worldMatrix;
    Vec3.set(this._startWorldOrigin, pos[12]!, pos[13]!, pos[14]!);

    Vec3.copy(this._startPos, target.transform.position);
    this._startRot.set(target.transform.rotation);
    Vec3.copy(this._startScale, target.transform.scale);

    if (this.mode === 'rotate') {
      const axisVec = _axisVecs[axis]!;
      if (intersectAxisPlane(this._startWorldOrigin, axisVec) >= 0) {
        this._startAngle = planeAngle(axis);
      } else {
        this._startAngle = 0;
      }
    } else {
      const axisVec = _axisVecs[axis]!;
      this._startValue = projectOnAxis(_ray, this._startWorldOrigin, axisVec);
    }
  }

  updateDrag(
    screenX: number, screenY: number,
    camera: CameraSettings, canvas: HTMLCanvasElement,
    target: GameObject, gizmoScale: number,
  ): void {
    if (!this.dragging || !this.activeAxis) return;
    if (!buildRay(screenX, screenY, camera, canvas)) return;

    if (this.mode === 'rotate') {
      this._updateRotation(target);
    } else {
      this._updateLinear(target, gizmoScale);
    }
  }

  private _updateLinear(target: GameObject, gizmoScale: number): void {
    const axisVec = _axisVecs[this.activeAxis!]!;
    const currentValue = projectOnAxis(_ray, this._startWorldOrigin, axisVec);
    let delta = currentValue - this._startValue;

    if (this.snapEnabled) {
      delta = Math.round(delta / this.snapSize) * this.snapSize;
    }

    const axisIdx = this.activeAxis === 'x' ? 0 : this.activeAxis === 'y' ? 1 : 2;

    if (this.mode === 'translate') {
      target.transform.setPositionComponent(axisIdx, this._startPos[axisIdx]! + delta);
    } else {
      const scaleDelta = delta / gizmoScale;
      target.transform.setScaleComponent(axisIdx, Math.max(0.01, this._startScale[axisIdx]! + scaleDelta));
    }
  }

  private _updateRotation(target: GameObject): void {
    const axisVec = _axisVecs[this.activeAxis!]!;
    if (intersectAxisPlane(this._startWorldOrigin, axisVec) < 0) return;

    let deltaAngle = planeAngle(this.activeAxis!) - this._startAngle;

    // Wrap to [-PI, PI]
    if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

    if (this.snapEnabled) {
      const snap = Math.PI / 12; // 15 degrees
      deltaAngle = Math.round(deltaAngle / snap) * snap;
    }

    Quat.fromAxisAngle(_deltaQuat, axisVec, deltaAngle);
    Quat.multiply(_deltaQuat, _deltaQuat, this._startRot);
    Quat.normalize(_deltaQuat, _deltaQuat);
    target.transform.setRotationFrom(_deltaQuat);
  }

  endDrag(): void {
    this.dragging = false;
    this.activeAxis = null;
  }
}
