import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, GameObject, resetGameObjectIds } from '@certe/atmos-core';
import { EditorState } from '../editor-state.js';
import {
  isPrefabLocked,
  getPrefabRoot,
  canReparent,
  deleteGameObject,
} from '../scene-operations.js';

let scene: Scene;
let state: EditorState;

beforeEach(() => {
  resetGameObjectIds();
  scene = new Scene();
  state = new EditorState(scene);
});

describe('isPrefabLocked', () => {
  it('returns false for normal objects', () => {
    const go = new GameObject('Normal');
    expect(isPrefabLocked(go)).toBe(false);
  });

  it('returns true for locked objects', () => {
    const go = new GameObject('Locked');
    go.prefabLocked = true;
    expect(isPrefabLocked(go)).toBe(true);
  });
});

describe('getPrefabRoot', () => {
  it('returns null for non-prefab objects', () => {
    const go = new GameObject('Normal');
    expect(getPrefabRoot(go)).toBeNull();
  });

  it('returns the root when called on the root itself', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'prefabs/test.prefab.json';
    root.prefabLocked = true;
    expect(getPrefabRoot(root)).toBe(root);
  });

  it('returns the root when called on a child', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'prefabs/test.prefab.json';
    root.prefabLocked = true;
    const child = new GameObject('Child');
    child.prefabLocked = true;
    child.setParent(root);
    expect(getPrefabRoot(child)).toBe(root);
  });
});

describe('canReparent with prefab locks', () => {
  it('blocks reparenting a locked child out of a prefab', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'test.prefab.json';
    root.prefabLocked = true;
    const child = new GameObject('Child');
    child.prefabLocked = true;
    child.setParent(root);
    scene.add(root);
    scene.add(child);

    const other = new GameObject('Other');
    scene.add(other);

    // Cannot reparent locked child to another parent
    expect(canReparent(child, other)).toBe(false);
    // Cannot reparent locked child to root
    expect(canReparent(child, null)).toBe(false);
  });

  it('blocks reparenting into a locked prefab', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'test.prefab.json';
    root.prefabLocked = true;
    scene.add(root);

    const other = new GameObject('Other');
    scene.add(other);

    expect(canReparent(other, root)).toBe(false);
  });

  it('allows reparenting a prefab root (has prefabSource)', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'test.prefab.json';
    root.prefabLocked = true;
    scene.add(root);

    const container = new GameObject('Container');
    scene.add(container);

    // Prefab root can be reparented as a whole unit
    expect(canReparent(root, container)).toBe(true);
  });
});

describe('deleteGameObject with prefab locks', () => {
  it('blocks deleting a locked child', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'test.prefab.json';
    root.prefabLocked = true;
    const child = new GameObject('Child');
    child.prefabLocked = true;
    child.setParent(root);
    scene.add(root);
    scene.add(child);

    const result = deleteGameObject(scene, child, state);
    expect(result).toBe(false);
    // Child should still exist
    expect([...scene.getAllObjects()]).toContain(child);
  });

  it('allows deleting the prefab root (removes entire instance)', () => {
    const root = new GameObject('Root');
    root.prefabSource = 'test.prefab.json';
    root.prefabLocked = true;
    const child = new GameObject('Child');
    child.prefabLocked = true;
    child.setParent(root);
    scene.add(root);
    scene.add(child);

    const result = deleteGameObject(scene, root, state);
    expect(result).toBe(true);
    expect([...scene.getAllObjects()]).toHaveLength(0);
  });
});
