import RAPIER from '@dimforge/rapier3d-compat';
import { Scene } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import type { PhysicsWorld } from './physics-world.js';
import { Collider } from './collider.js';

export interface HitResult {
  collider: Collider;
  gameObject: import('@atmos/core').GameObject;
  point: Float32Array;   // Vec3 – world-space hit point
  normal: Float32Array;  // Vec3 – surface normal at hit
  distance: number;
}

// Scratch ray reused across calls
let _scratchRay: RAPIER.Ray | null = null;

function getScratchRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): RAPIER.Ray {
  if (!_scratchRay) {
    _scratchRay = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
  } else {
    _scratchRay.origin.x = ox;
    _scratchRay.origin.y = oy;
    _scratchRay.origin.z = oz;
    _scratchRay.dir.x = dx;
    _scratchRay.dir.y = dy;
    _scratchRay.dir.z = dz;
  }
  return _scratchRay;
}

/** Build handle→Collider reverse map from the current scene. */
function buildColliderMap(): Map<number, Collider> {
  const scene = Scene.current;
  if (!scene) return new Map();
  const map = new Map<number, Collider>();
  const colliders = scene.findAll(Collider);
  for (const c of colliders) {
    if (c.collider) {
      map.set(c.collider.handle, c);
    }
  }
  return map;
}

function hitFromRapier(
  rapierCollider: RAPIER.Collider,
  toi: number,
  normal: { x: number; y: number; z: number },
  origin: Float32Array,
  dir: Float32Array,
  map: Map<number, Collider>,
): HitResult | null {
  const comp = map.get(rapierCollider.handle);
  if (!comp) return null;
  const point = Vec3.create();
  // point = origin + dir * toi
  const scaled = Vec3.create();
  Vec3.scale(scaled, dir, toi);
  Vec3.add(point, origin, scaled);
  const norm = Vec3.create();
  norm[0] = normal.x;
  norm[1] = normal.y;
  norm[2] = normal.z;
  return {
    collider: comp,
    gameObject: comp.gameObject,
    point,
    normal: norm,
    distance: toi,
  };
}

/**
 * Stateless physics query utilities.
 * All methods require a PhysicsWorld and use Scene.current to resolve collider ownership.
 */
export class Physics {
  /** Cast a ray and return the first hit, or null. */
  static raycast(
    world: PhysicsWorld,
    origin: Float32Array,
    dir: Float32Array,
    maxDist: number,
  ): HitResult | null {
    const ray = getScratchRay(origin[0]!, origin[1]!, origin[2]!, dir[0]!, dir[1]!, dir[2]!);
    const hit = world.world.castRayAndGetNormal(ray, maxDist, true);
    if (!hit) return null;
    const map = buildColliderMap();
    const rapierCol = hit.collider;
    return hitFromRapier(rapierCol, hit.timeOfImpact, hit.normal, origin, dir, map);
  }

  /** Cast a ray and return all hits. */
  static raycastAll(
    world: PhysicsWorld,
    origin: Float32Array,
    dir: Float32Array,
    maxDist: number,
  ): HitResult[] {
    const ray = getScratchRay(origin[0]!, origin[1]!, origin[2]!, dir[0]!, dir[1]!, dir[2]!);
    const map = buildColliderMap();
    const results: HitResult[] = [];
    world.world.intersectionsWithRay(ray, maxDist, true, (intersection) => {
      const rapierCol = intersection.collider;
      const result = hitFromRapier(rapierCol, intersection.timeOfImpact, intersection.normal, origin, dir, map);
      if (result) results.push(result);
      return true; // continue
    });
    return results;
  }

  /** Find the first collider overlapping a sphere at the given center and radius. */
  static sphereCast(
    world: PhysicsWorld,
    center: Float32Array,
    radius: number,
  ): HitResult | null {
    const shape = new RAPIER.Ball(radius);
    const pos = { x: center[0]!, y: center[1]!, z: center[2]! };
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    const map = buildColliderMap();
    let result: HitResult | null = null;
    world.world.intersectionsWithShape(pos, rot, shape, (rapierCol) => {
      const comp = map.get(rapierCol.handle);
      if (comp) {
        const point = Vec3.create();
        point[0] = center[0]!;
        point[1] = center[1]!;
        point[2] = center[2]!;
        result = {
          collider: comp,
          gameObject: comp.gameObject,
          point,
          normal: Vec3.create(), // no normal for overlap test
          distance: 0,
        };
        return false; // stop after first
      }
      return true;
    });
    return result;
  }

  /** Find all colliders overlapping a sphere. */
  static sphereCastAll(
    world: PhysicsWorld,
    center: Float32Array,
    radius: number,
  ): HitResult[] {
    const shape = new RAPIER.Ball(radius);
    const pos = { x: center[0]!, y: center[1]!, z: center[2]! };
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    const map = buildColliderMap();
    const results: HitResult[] = [];
    world.world.intersectionsWithShape(pos, rot, shape, (rapierCol) => {
      const comp = map.get(rapierCol.handle);
      if (comp) {
        const point = Vec3.create();
        point[0] = center[0]!;
        point[1] = center[1]!;
        point[2] = center[2]!;
        results.push({
          collider: comp,
          gameObject: comp.gameObject,
          point,
          normal: Vec3.create(),
          distance: 0,
        });
      }
      return true;
    });
    return results;
  }

  /** Find the first collider overlapping a box at the given center with half-extents. */
  static boxCast(
    world: PhysicsWorld,
    center: Float32Array,
    halfExtents: Float32Array,
  ): HitResult | null {
    const shape = new RAPIER.Cuboid(halfExtents[0]!, halfExtents[1]!, halfExtents[2]!);
    const pos = { x: center[0]!, y: center[1]!, z: center[2]! };
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    const map = buildColliderMap();
    let result: HitResult | null = null;
    world.world.intersectionsWithShape(pos, rot, shape, (rapierCol) => {
      const comp = map.get(rapierCol.handle);
      if (comp) {
        const point = Vec3.create();
        point[0] = center[0]!;
        point[1] = center[1]!;
        point[2] = center[2]!;
        result = {
          collider: comp,
          gameObject: comp.gameObject,
          point,
          normal: Vec3.create(),
          distance: 0,
        };
        return false;
      }
      return true;
    });
    return result;
  }

  /** Find all colliders overlapping a box. */
  static boxCastAll(
    world: PhysicsWorld,
    center: Float32Array,
    halfExtents: Float32Array,
  ): HitResult[] {
    const shape = new RAPIER.Cuboid(halfExtents[0]!, halfExtents[1]!, halfExtents[2]!);
    const pos = { x: center[0]!, y: center[1]!, z: center[2]! };
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    const map = buildColliderMap();
    const results: HitResult[] = [];
    world.world.intersectionsWithShape(pos, rot, shape, (rapierCol) => {
      const comp = map.get(rapierCol.handle);
      if (comp) {
        const point = Vec3.create();
        point[0] = center[0]!;
        point[1] = center[1]!;
        point[2] = center[2]!;
        results.push({
          collider: comp,
          gameObject: comp.gameObject,
          point,
          normal: Vec3.create(),
          distance: 0,
        });
      }
      return true;
    });
    return results;
  }
}
