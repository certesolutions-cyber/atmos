import { Scene } from './scene.js';
import { GameObject } from './game-object.js';
import { Transform } from './transform.js';
import { getComponentDef, getAllRegisteredComponents } from './component-registry.js';
import type { Component } from './component.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- match registry's ComponentConstructor
type ComponentConstructor = abstract new (...args: any[]) => any;

export interface ComponentData {
  type: string;
  data: Record<string, unknown>;
}

export interface GameObjectData {
  name: string;
  id: number;
  parentId: number | null;
  /** @deprecated Use parentId instead */
  parentName?: string | null;
  components: ComponentData[];
}

export interface PostProcessData {
  bloomIntensity?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  ssaoEnabled?: boolean;
  ssaoRadius?: number;
  ssaoBias?: number;
  ssaoIntensity?: number;
  exposure?: number;
  vignetteIntensity?: number;
  vignetteRadius?: number;
  fogEnabled?: boolean;
  fogMode?: 'linear' | 'exponential';
  fogDensity?: number;
  fogStart?: number;
  fogEnd?: number;
  fogColor?: number[];
}

export interface SceneData {
  gameObjects: GameObjectData[];
  postProcess?: PostProcessData;
}

export interface DeserializeContext {
  onComponent?(gameObject: GameObject, type: string, data: Record<string, unknown>): void;
  onComplete?(): void;
}

function resolvePropertyPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function toSerializableValue(value: unknown): unknown {
  if (value instanceof Float32Array) {
    return Array.from(value);
  }
  if (value instanceof GameObject) {
    return value.id;
  }
  return value;
}

export function serializeScene(scene: Scene): SceneData {
  const allComponents = getAllRegisteredComponents();
  const ctorByName = new Map<string, ComponentConstructor>();
  for (const [ctor, def] of allComponents) {
    ctorByName.set(def.name, ctor);
  }

  const gameObjects: GameObjectData[] = [];

  for (const obj of scene.getAllObjects()) {
    if (obj.transient) continue;
    const components: ComponentData[] = [];

    // Serialize Transform (always present)
    const transformDef = getComponentDef(Transform);
    if (transformDef) {
      const data: Record<string, unknown> = {};
      for (const prop of transformDef.properties) {
        data[prop.key] = toSerializableValue(resolvePropertyPath(obj.transform, prop.key));
      }
      components.push({ type: 'Transform', data });
    }

    // Serialize other components
    for (const comp of obj.getComponents()) {
      const def = getComponentDef(comp.constructor as typeof Component);
      if (!def || def.name === 'Transform') continue;

      const data: Record<string, unknown> = {};
      for (const prop of def.properties) {
        data[prop.key] = toSerializableValue(resolvePropertyPath(comp, prop.key));
      }
      components.push({ type: def.name, data });
    }

    gameObjects.push({
      name: obj.name,
      id: obj.id,
      parentId: obj.parent?.id ?? null,
      components,
    });
  }

  return { gameObjects };
}

function setPropertyPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current == null || typeof current !== 'object') return;
    current = (current as Record<string, unknown>)[parts[i]!];
  }
  if (current == null || typeof current !== 'object') return;
  const lastKey = parts[parts.length - 1]!;
  const existing = (current as Record<string, unknown>)[lastKey];

  if (existing instanceof Float32Array && Array.isArray(value)) {
    for (let i = 0; i < value.length && i < existing.length; i++) {
      existing[i] = value[i] as number;
    }
    // Re-assign to trigger setter (e.g. HingeJoint.axis recreates joint)
    (current as Record<string, unknown>)[lastKey] = existing;
  } else {
    // Skip getter-only properties
    const desc = Object.getOwnPropertyDescriptor(current, lastKey)
      ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(current), lastKey);
    if (desc && desc.get && !desc.set) return;
    (current as Record<string, unknown>)[lastKey] = value;
  }
}

export function applyComponentData(target: unknown, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    setPropertyPath(target, key, value);
  }
}

export function deserializeScene(data: SceneData, context?: DeserializeContext): Scene {
  const scene = new Scene();
  const objectsById = new Map<number, GameObject>();
  const objectsByName = new Map<string, GameObject>();

  // Build name→def lookup for resolving gameObjectRef properties
  const defByName = new Map<string, { properties: Array<{ key: string; type: string }> }>();
  for (const [, def] of getAllRegisteredComponents()) {
    defByName.set(def.name, def);
  }

  // Pass 1: create all game objects + apply transforms
  if (!data.gameObjects || !Array.isArray(data.gameObjects)) {
    return scene;
  }
  for (const objData of data.gameObjects) {
    const go = new GameObject(objData.name);
    if (objData.id !== undefined) objectsById.set(objData.id, go);
    objectsByName.set(objData.name, go);

    const transformData = objData.components.find((c) => c.type === 'Transform');
    if (transformData) {
      const td = transformData.data;
      if (Array.isArray(td['position'])) {
        const p = td['position'] as number[];
        go.transform.setPosition(p[0]!, p[1]!, p[2]!);
      }
      if (Array.isArray(td['rotation'])) {
        const r = td['rotation'] as number[];
        go.transform.setRotation(r[0]!, r[1]!, r[2]!, r[3]!);
      }
      if (Array.isArray(td['scale'])) {
        const s = td['scale'] as number[];
        go.transform.setScale(s[0]!, s[1]!, s[2]!);
      }
    }
  }

  // Pass 2: create components (all objects exist, so gameObjectRef ids can resolve)
  for (const objData of data.gameObjects) {
    const go = objData.id !== undefined ? objectsById.get(objData.id) : objectsByName.get(objData.name);
    if (!go) continue;

    for (const compData of objData.components) {
      if (compData.type === 'Transform') continue;

      // Resolve gameObjectRef ids → actual GameObjects
      const def = defByName.get(compData.type);
      if (def) {
        for (const prop of def.properties) {
          if (prop.type === 'gameObjectRef' && typeof compData.data[prop.key] === 'number') {
            compData.data[prop.key] = objectsById.get(compData.data[prop.key] as number) ?? null;
          }
        }
      }

      context?.onComponent?.(go, compData.type, compData.data);
    }
  }

  // Pass 3: set parent-child relationships (prefer id, fallback to name for old format)
  for (const objData of data.gameObjects) {
    const go = objData.id !== undefined ? objectsById.get(objData.id) : objectsByName.get(objData.name);
    if (!go) continue;
    if (objData.parentId != null) {
      const parent = objectsById.get(objData.parentId);
      if (parent) go.setParent(parent);
    } else if (objData.parentName) {
      const parent = objectsByName.get(objData.parentName);
      if (parent) go.setParent(parent);
    }
    scene.add(go);
  }

  // NOTE: caller is responsible for awaiting context.onComplete() after this returns.
  return scene;
}

const POST_PROCESS_KEYS: (keyof PostProcessData)[] = [
  'bloomIntensity', 'bloomThreshold', 'bloomRadius',
  'ssaoEnabled', 'ssaoRadius', 'ssaoBias', 'ssaoIntensity',
  'exposure', 'vignetteIntensity', 'vignetteRadius',
  'fogEnabled', 'fogMode', 'fogDensity', 'fogStart', 'fogEnd', 'fogColor',
];

export function serializePostProcess(source: Record<string, unknown>): PostProcessData {
  const result: PostProcessData = {};
  for (const key of POST_PROCESS_KEYS) {
    const val = source[key];
    if (val === undefined) continue;
    (result as Record<string, unknown>)[key] = toSerializableValue(val);
  }
  return result;
}

export function applyPostProcess(target: Record<string, unknown>, data: PostProcessData): void {
  for (const key of POST_PROCESS_KEYS) {
    const val = (data as Record<string, unknown>)[key];
    if (val === undefined) continue;
    const existing = target[key];
    if (existing instanceof Float32Array && Array.isArray(val)) {
      for (let i = 0; i < val.length && i < existing.length; i++) {
        existing[i] = val[i] as number;
      }
      target[key] = existing;
    } else {
      target[key] = val;
    }
  }
}
