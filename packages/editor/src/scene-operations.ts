import type { Scene, GameObject, Component } from '@atmos/core';
import { GameObject as GameObjectClass, getComponentDef } from '@atmos/core';
import { Mat4, Quat } from '@atmos/math';
import type { Mat4Type, QuatType } from '@atmos/math';
import type { EditorState } from './editor-state.js';

// Scratch data for reparenting (no heap allocs)
const _invParentWorld: Mat4Type = Mat4.create();
const _newLocal: Mat4Type = Mat4.create();
const _tmpQuat: QuatType = Quat.create();

export type ReparentValidator = (child: GameObject, newParent: GameObject | null) => boolean;
export type ReparentCallback = (child: GameObject) => void;
export type DuplicateCallback = (copy: GameObject, source: GameObject) => void;

let _reparentValidator: ReparentValidator | null = null;
let _onReparent: ReparentCallback | null = null;
let _onDuplicate: DuplicateCallback | null = null;

export function setReparentValidator(fn: ReparentValidator | null): void {
  _reparentValidator = fn;
}

export function setOnReparent(fn: ReparentCallback | null): void {
  _onReparent = fn;
}

export function setOnDuplicate(fn: DuplicateCallback | null): void {
  _onDuplicate = fn;
}

export function findObjectById(scene: Scene, id: number): GameObject | null {
  for (const obj of scene.getAllObjects()) {
    if (obj.id === id) return obj;
  }
  return null;
}

function resolvePropertyPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setPropertyPath(target: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: unknown = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current == null || typeof current !== 'object') return;
    current = (current as Record<string, unknown>)[parts[i]!];
  }
  if (current == null || typeof current !== 'object') return;
  const key = parts[parts.length - 1]!;
  const existing = (current as Record<string, unknown>)[key];
  if (existing instanceof Float32Array && Array.isArray(value)) {
    for (let i = 0; i < value.length && i < existing.length; i++) existing[i] = value[i] as number;
    (current as Record<string, unknown>)[key] = existing;
  } else {
    (current as Record<string, unknown>)[key] = value;
  }
}

function clonePropertyValue(value: unknown): unknown {
  if (value instanceof Float32Array) return new Float32Array(value);
  if (Array.isArray(value)) return [...value];
  return value;
}

function cloneObjectShallow(source: GameObject): GameObject {
  const copy = new GameObjectClass(source.name + ' (Copy)');

  // Copy transform
  copy.transform.setPositionFrom(source.transform.position);
  copy.transform.setRotationFrom(source.transform.rotation);
  copy.transform.setScaleFrom(source.transform.scale);

  // Copy components with registered properties
  for (const comp of source.getComponents()) {
    const Ctor = comp.constructor as new () => Component;
    const def = getComponentDef(Ctor);
    const newComp = copy.addComponent(Ctor);
    if (def) {
      for (const prop of def.properties) {
        const value = resolvePropertyPath(comp, prop.key);
        if (value !== undefined) {
          setPropertyPath(newComp, prop.key, clonePropertyValue(value));
        }
      }
    }
    // Copy shared GPU resource references (not registered but needed for rendering)
    const src = comp as Record<string, unknown>;
    const dst = newComp as Record<string, unknown>;
    if (src['mesh'] !== undefined) dst['mesh'] = src['mesh'];
    if (src['material'] !== undefined) dst['material'] = src['material'];
  }

  return copy;
}

function cloneObjectDeep(scene: Scene, source: GameObject): GameObject {
  const copy = cloneObjectShallow(source);

  // Recursively duplicate children and parent them under the copy
  for (const child of source.children) {
    const childCopy = cloneObjectDeep(scene, child);
    childCopy.setParent(copy);
  }

  return copy;
}

export function duplicateGameObject(scene: Scene, source: GameObject): GameObject {
  const copy = cloneObjectDeep(scene, source);

  // Place copy under same parent as source
  if (source.parent) {
    copy.setParent(source.parent);
  }

  scene.add(copy);

  // Post-duplicate hook: initialize physics components etc.
  if (_onDuplicate) {
    const initSubtree = (c: GameObject, s: GameObject) => {
      _onDuplicate!(c, s);
      const copyChildren = c.children;
      const srcChildren = s.children;
      for (let i = 0; i < copyChildren.length; i++) {
        initSubtree(copyChildren[i]!, srcChildren[i]!);
      }
    };
    initSubtree(copy, source);
  }

  return copy;
}

export function deleteGameObject(
  scene: Scene,
  target: GameObject,
  editorState: EditorState,
): void {
  // Recursively delete children first
  const children = [...target.children];
  for (const child of children) {
    deleteGameObject(scene, child, editorState);
  }

  // Remove from selection if target was selected
  editorState.removeFromSelection(target);

  // Remove from parent
  target.setParent(null);

  // Remove from scene
  scene.remove(target);
}

function isDescendant(obj: GameObject, potentialAncestor: GameObject): boolean {
  let current = obj.parent;
  while (current) {
    if (current === potentialAncestor) return true;
    current = current.parent;
  }
  return false;
}

export function canReparent(child: GameObject, newParent: GameObject | null): boolean {
  if (!newParent) return true; // root is always valid
  if (child === newParent) return false;
  if (isDescendant(newParent, child)) return false;
  if (_reparentValidator && !_reparentValidator(child, newParent)) return false;
  return true;
}

export function reparentGameObject(
  scene: Scene,
  child: GameObject,
  newParent: GameObject | null,
): void {
  if (!canReparent(child, newParent)) return;

  // Ensure world matrices are up to date before reparenting
  child.transform.updateWorldMatrix();

  // Save current world matrix
  const savedWorld = new Float32Array(child.transform.worldMatrix);

  // Remove from scene roots if currently a root
  const wasRoot = !child.parent;
  child.setParent(newParent);

  // Compute new local transform that preserves the world transform
  // newLocal = inv(newParentWorld) * savedWorld
  if (newParent) {
    newParent.transform.updateWorldMatrix();
    if (Mat4.invert(_invParentWorld, newParent.transform.worldMatrix)) {
      Mat4.multiply(_newLocal, _invParentWorld, savedWorld);
    } else {
      _newLocal.set(savedWorld);
    }
  } else {
    // No parent: local = world
    _newLocal.set(savedWorld);
  }

  // Decompose newLocal into position, rotation, scale
  // Position = translation column
  child.transform.setPosition(_newLocal[12]!, _newLocal[13]!, _newLocal[14]!);

  // Scale = column vector lengths
  const sx = Math.sqrt(_newLocal[0]! * _newLocal[0]! + _newLocal[1]! * _newLocal[1]! + _newLocal[2]! * _newLocal[2]!);
  const sy = Math.sqrt(_newLocal[4]! * _newLocal[4]! + _newLocal[5]! * _newLocal[5]! + _newLocal[6]! * _newLocal[6]!);
  const sz = Math.sqrt(_newLocal[8]! * _newLocal[8]! + _newLocal[9]! * _newLocal[9]! + _newLocal[10]! * _newLocal[10]!);
  child.transform.setScale(sx, sy, sz);

  // Rotation = extract quaternion from normalized rotation part
  Quat.fromMat4(_tmpQuat, _newLocal);
  child.transform.setRotationFrom(_tmpQuat);

  // Update root tracking without destroying components
  scene.updateRootStatus(child);

  // Notify listeners (e.g. physics collider re-attachment)
  _onReparent?.(child);
}
