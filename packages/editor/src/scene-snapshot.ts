import type { Scene, GameObject, PropertyDef } from '@certe/atmos-core';
import { getComponentDef } from '@certe/atmos-core';
import { getProperty, setProperty } from './property-setters.js';

interface TransformSnapshot {
  position: number[];
  rotation: number[];
  scale: number[];
}

interface ComponentSnapshot {
  ctorName: string;
  properties: Map<string, unknown>;
}

interface GameObjectSnapshot {
  id: number;
  transform: TransformSnapshot;
  components: ComponentSnapshot[];
}

export type SceneSnapshot = GameObjectSnapshot[];

/**
 * Snapshot all GameObjects' transforms and registered component properties.
 * gameObjectRef values are stored as `{ __goRef: id }` markers.
 */
export function takeSnapshot(scene: Scene): SceneSnapshot {
  const snapshot: SceneSnapshot = [];
  for (const go of scene.getAllObjects()) {
    snapshot.push(snapshotGameObject(go));
  }
  return snapshot;
}

/**
 * Restore snapshot values onto existing GameObjects in-place.
 * Objects not found in the scene are skipped. Marks transforms dirty.
 */
export function restoreSnapshot(scene: Scene, snapshot: SceneSnapshot): void {
  // Build set of snapshotted ids
  const snapshotIds = new Set<number>();
  for (const entry of snapshot) {
    snapshotIds.add(entry.id);
  }

  // Remove objects that were added at runtime (not in snapshot)
  const toRemove: GameObject[] = [];
  for (const go of scene.getAllObjects()) {
    if (!snapshotIds.has(go.id)) toRemove.push(go);
  }
  for (const go of toRemove) {
    scene.remove(go);
  }

  // Build id→GameObject lookup (after removals)
  const byId = new Map<number, GameObject>();
  for (const go of scene.getAllObjects()) {
    byId.set(go.id, go);
  }

  // Pass 1: Restore ALL transforms first so that auto-computed properties
  // (e.g. HingeJoint.connectedAxis) see correct world matrices for all objects.
  for (const entry of snapshot) {
    const go = byId.get(entry.id);
    if (!go) continue;

    const t = go.transform;
    t.setPositionFrom(entry.transform.position);
    t.setRotationFrom(entry.transform.rotation);
    t.setScaleFrom(entry.transform.scale);
  }

  // Pass 2: Restore component properties (setters may trigger joint recreation
  // that depends on other objects' transforms being correct).
  for (const entry of snapshot) {
    const go = byId.get(entry.id);
    if (!go) continue;

    const liveComponents = go.getComponents();
    for (let ci = 0; ci < entry.components.length; ci++) {
      const compSnap = entry.components[ci]!;
      // Match by index — components are snapshotted in getComponents() order,
      // so the same index maps to the same instance (supports multiple of one type).
      const comp = liveComponents[ci];
      if (!comp || comp.constructor.name !== compSnap.ctorName) continue;

      const def = getComponentDef(comp.constructor as new () => typeof comp);
      if (!def) continue;

      for (const propDef of def.properties) {
        const saved = compSnap.properties.get(propDef.key);
        if (saved === undefined) continue;

        const resolved = resolveValue(saved, propDef, byId);
        setProperty(comp, propDef, resolved);
      }
    }
  }
}

function snapshotGameObject(go: GameObject): GameObjectSnapshot {
  const t = go.transform;
  const components: ComponentSnapshot[] = [];

  for (const comp of go.getComponents()) {
    const def = getComponentDef(comp.constructor as new () => typeof comp);
    if (!def) continue;

    const properties = new Map<string, unknown>();
    for (const propDef of def.properties) {
      let value = getProperty(comp, propDef);
      // Store gameObjectRef as id marker
      if (propDef.type === 'gameObjectRef' && value && typeof value === 'object' && 'id' in (value as object)) {
        value = { __goRef: (value as GameObject).id };
      }
      properties.set(propDef.key, value);
    }

    components.push({ ctorName: comp.constructor.name, properties });
  }

  return {
    id: go.id,
    transform: {
      position: Array.from(t.position),
      rotation: Array.from(t.rotation),
      scale: Array.from(t.scale),
    },
    components,
  };
}

function resolveValue(
  value: unknown,
  propDef: PropertyDef,
  byId: Map<number, GameObject>,
): unknown {
  if (
    propDef.type === 'gameObjectRef' &&
    value && typeof value === 'object' && '__goRef' in (value as Record<string, unknown>)
  ) {
    return byId.get((value as { __goRef: number }).__goRef) ?? null;
  }
  return value;
}
