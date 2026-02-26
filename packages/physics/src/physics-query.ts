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

// Cached collider map — rebuilt once per invalidation cycle
let _cachedMap: Map<number, Collider> = new Map();
let _cachedScene: Scene | null = null;
let _cacheValid = false;

/** Invalidate the cached collider map. Call once per frame or when colliders change. */
export function invalidateColliderMap(): void {
  _cacheValid = false;
}

/** Build handle→Collider reverse map. Cached until invalidated to avoid repeated traversals. */
function buildColliderMap(): Map<number, Collider> {
  const scene = Scene.current;
  if (!scene) return new Map();
  if (_cacheValid && scene === _cachedScene) return _cachedMap;
  _cachedScene = scene;
  _cacheValid = true;
  _cachedMap = new Map();
  const colliders = scene.findAll(Collider);
  for (const c of colliders) {
    if (c.collider) {
      _cachedMap.set(c.collider.handle, c);
    }
  }
  return _cachedMap;
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

/** Shared overlap query helper: runs intersectionsWithShape and maps results to HitResults. */
function overlapQuery(
  world: PhysicsWorld,
  center: Float32Array,
  shape: RAPIER.Shape,
  firstOnly: boolean,
): HitResult[] {
  const pos = { x: center[0]!, y: center[1]!, z: center[2]! };
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const map = buildColliderMap();
  const results: HitResult[] = [];
  world.world.intersectionsWithShape(pos, rot, shape, (rapierCol) => {
    const comp = map.get(rapierCol.handle);
    if (comp) {
      const point = Vec3.create();
      Vec3.set(point, center[0]!, center[1]!, center[2]!);
      results.push({
        collider: comp,
        gameObject: comp.gameObject,
        point,
        normal: Vec3.create(),
        distance: 0,
      });
      if (firstOnly) return false;
    }
    return true;
  });
  return results;
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
    return hitFromRapier(hit.collider, hit.timeOfImpact, hit.normal, origin, dir, map);
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
      const result = hitFromRapier(intersection.collider, intersection.timeOfImpact, intersection.normal, origin, dir, map);
      if (result) results.push(result);
      return true;
    });
    return results;
  }

  /** Find the first collider overlapping a sphere at the given center and radius. */
  static sphereCast(
    world: PhysicsWorld,
    center: Float32Array,
    radius: number,
  ): HitResult | null {
    const results = overlapQuery(world, center, new RAPIER.Ball(radius), true);
    return results[0] ?? null;
  }

  /** Find all colliders overlapping a sphere. */
  static sphereCastAll(
    world: PhysicsWorld,
    center: Float32Array,
    radius: number,
  ): HitResult[] {
    return overlapQuery(world, center, new RAPIER.Ball(radius), false);
  }

  /** Find the first collider overlapping a box at the given center with half-extents. */
  static boxCast(
    world: PhysicsWorld,
    center: Float32Array,
    halfExtents: Float32Array,
  ): HitResult | null {
    const shape = new RAPIER.Cuboid(halfExtents[0]!, halfExtents[1]!, halfExtents[2]!);
    const results = overlapQuery(world, center, shape, true);
    return results[0] ?? null;
  }

  /** Find all colliders overlapping a box. */
  static boxCastAll(
    world: PhysicsWorld,
    center: Float32Array,
    halfExtents: Float32Array,
  ): HitResult[] {
    return overlapQuery(world, center, new RAPIER.Cuboid(halfExtents[0]!, halfExtents[1]!, halfExtents[2]!), false);
  }
}
