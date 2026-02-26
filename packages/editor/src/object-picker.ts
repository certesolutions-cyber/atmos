import type { Scene, GameObject } from '@atmos/core';
import { Mat4, Ray, Vec3 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { CameraSettings } from '@atmos/renderer';
import { MeshRenderer } from '@atmos/renderer';

export interface PickResult {
  gameObject: GameObject;
  distance: number;
}

// Pre-allocated scratch data (no heap allocs per pick call)
const _ray = Ray.create();
const _localRay = Ray.create();
const _viewMatrix: Mat4Type = Mat4.create();
const _projMatrix: Mat4Type = Mat4.create();
const _vpMatrix: Mat4Type = Mat4.create();
const _invVP: Mat4Type = Mat4.create();
const _invWorld: Mat4Type = Mat4.create();
const _v0 = Vec3.create();
const _v1 = Vec3.create();
const _v2 = Vec3.create();
const _hitLocal = Vec3.create();
const _hitWorld = Vec3.create();

function transformPoint(out: Float32Array, m: Float32Array, p: Float32Array): void {
  const x = p[0]!, y = p[1]!, z = p[2]!;
  out[0] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  out[1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  out[2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
}

function transformDir(out: Float32Array, m: Float32Array, d: Float32Array): void {
  const x = d[0]!, y = d[1]!, z = d[2]!;
  out[0] = m[0]! * x + m[4]! * y + m[8]! * z;
  out[1] = m[1]! * x + m[5]! * y + m[9]! * z;
  out[2] = m[2]! * x + m[6]! * y + m[10]! * z;
}

export class ObjectPicker {
  pick(
    screenX: number,
    screenY: number,
    scene: Scene,
    camera: CameraSettings,
    canvas: HTMLCanvasElement,
  ): PickResult | null {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return null;

    // Build VP matrix
    const aspect = w / h;
    Mat4.perspective(_projMatrix, camera.fovY, aspect, camera.near, camera.far);
    Mat4.lookAt(_viewMatrix, camera.eye, camera.target, camera.up);
    Mat4.multiply(_vpMatrix, _projMatrix, _viewMatrix);

    // Invert VP
    if (!Mat4.invert(_invVP, _vpMatrix)) return null;

    // Build ray from screen coords
    Ray.fromScreenCoords(_ray, screenX, screenY, w, h, _invVP);

    let bestResult: PickResult | null = null;

    for (const obj of scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (!mr || !mr.enabled) continue;

      // Bounding sphere early-out
      const bs = mr.worldBoundingSphere;
      if (!bs) continue;
      if (Ray.intersectSphere(_ray, bs.center, bs.radius) < 0) continue;

      // Triangle-level test if CPU data available
      const mesh = mr.mesh;
      if (mesh?.vertices && mesh.indices && mesh.vertexStride) {
        const dist = this._pickTriangles(obj, mesh.vertices, mesh.indices, mesh.vertexStride);
        if (dist >= 0 && (!bestResult || dist < bestResult.distance)) {
          bestResult = { gameObject: obj, distance: dist };
        }
      } else {
        // Fallback: bounding sphere distance
        const t = Ray.intersectSphere(_ray, bs.center, bs.radius);
        if (!bestResult || t < bestResult.distance) {
          bestResult = { gameObject: obj, distance: t };
        }
      }
    }

    return bestResult;
  }

  private _pickTriangles(
    obj: GameObject,
    vertices: Float32Array,
    indices: Uint16Array | Uint32Array,
    stride: number,
  ): number {
    // Transform ray to object's local space
    const worldMatrix = obj.transform.worldMatrix;
    if (!Mat4.invert(_invWorld, worldMatrix)) return -1;

    transformPoint(_localRay.origin, _invWorld, _ray.origin);
    transformDir(_localRay.direction, _invWorld, _ray.direction);

    let bestT = -1;

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]! * stride;
      const i1 = indices[i + 1]! * stride;
      const i2 = indices[i + 2]! * stride;

      Vec3.set(_v0, vertices[i0]!, vertices[i0 + 1]!, vertices[i0 + 2]!);
      Vec3.set(_v1, vertices[i1]!, vertices[i1 + 1]!, vertices[i1 + 2]!);
      Vec3.set(_v2, vertices[i2]!, vertices[i2 + 1]!, vertices[i2 + 2]!);

      const t = Ray.intersectTriangle(_localRay, _v0, _v1, _v2);
      if (t >= 0 && (bestT < 0 || t < bestT)) {
        bestT = t;
      }
    }

    if (bestT < 0) return -1;

    // Compute world-space hit point for distance comparison
    Ray.pointOnRay(_hitLocal, _localRay, bestT);
    transformPoint(_hitWorld, worldMatrix, _hitLocal);

    const dx = _hitWorld[0]! - _ray.origin[0]!;
    const dy = _hitWorld[1]! - _ray.origin[1]!;
    const dz = _hitWorld[2]! - _ray.origin[2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
