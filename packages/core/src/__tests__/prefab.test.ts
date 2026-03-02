import { describe, it, expect, beforeEach } from 'vitest';
import { Scene } from '../scene.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';
import { clearRegistry } from '../component-registry.js';
import { registerCoreBuiltins } from '../register-builtins.js';
import { serializePrefab, deserializePrefab, instantiatePrefab } from '../prefab.js';

beforeEach(() => {
  clearRegistry();
  resetGameObjectIds();
  registerCoreBuiltins();
});

describe('serializePrefab', () => {
  it('serializes a scene with a single root', () => {
    const scene = new Scene();
    const root = new GameObject('Root');
    const child = new GameObject('Child');
    child.setParent(root);
    scene.add(root);
    scene.add(child);

    const data = serializePrefab(scene);
    expect(data.version).toBe(1);
    expect(data.gameObjects).toHaveLength(2);
    expect(data.gameObjects[0]!.name).toBe('Root');
  });

  it('throws MULTIPLE_ROOTS when scene has multiple roots', () => {
    const scene = new Scene();
    scene.add(new GameObject('A'));
    scene.add(new GameObject('B'));

    expect(() => serializePrefab(scene)).toThrow('MULTIPLE_ROOTS');
  });

  it('throws EMPTY_SCENE when scene is empty', () => {
    const scene = new Scene();
    expect(() => serializePrefab(scene)).toThrow('EMPTY_SCENE');
  });

  it('ignores transient objects when counting roots', () => {
    const scene = new Scene();
    const root = new GameObject('Root');
    const transientObj = new GameObject('Transient');
    transientObj.transient = true;
    scene.add(root);
    scene.add(transientObj);

    const data = serializePrefab(scene);
    expect(data.version).toBe(1);
    // Transient objects are skipped by serializeScene, so only Root appears
    expect(data.gameObjects).toHaveLength(1);
  });
});

describe('deserializePrefab', () => {
  it('round-trips serialize → deserialize', () => {
    const scene = new Scene();
    const root = new GameObject('PrefabRoot');
    root.transform.setPosition(1, 2, 3);
    const child = new GameObject('PrefabChild');
    child.setParent(root);
    scene.add(root);
    scene.add(child);

    const data = serializePrefab(scene);
    const restored = deserializePrefab(data);
    const objects = [...restored.getAllObjects()];
    expect(objects).toHaveLength(2);

    const restoredRoot = objects.find((o) => o.name === 'PrefabRoot');
    expect(restoredRoot).toBeDefined();
    expect(restoredRoot!.transform.position[0]).toBeCloseTo(1);
    expect(restoredRoot!.transform.position[1]).toBeCloseTo(2);
    expect(restoredRoot!.transform.position[2]).toBeCloseTo(3);

    const restoredChild = objects.find((o) => o.name === 'PrefabChild');
    expect(restoredChild).toBeDefined();
    expect(restoredChild!.parent).toBe(restoredRoot);
  });
});

describe('instantiatePrefab', () => {
  it('sets prefabSource on root and prefabLocked on all nodes', () => {
    const scene = new Scene();
    const root = new GameObject('Root');
    const child = new GameObject('Child');
    child.setParent(root);
    scene.add(root);
    scene.add(child);

    const data = serializePrefab(scene);
    const instScene = instantiatePrefab(data, 'prefabs/test.prefab.json');
    const objects = [...instScene.getAllObjects()];

    const instRoot = instScene.roots[0]!;
    expect(instRoot.prefabSource).toBe('prefabs/test.prefab.json');
    expect(instRoot.prefabLocked).toBe(true);

    for (const obj of objects) {
      expect(obj.prefabLocked).toBe(true);
    }
  });

  it('returns a scene whose root can be moved to another scene', () => {
    const scene = new Scene();
    const root = new GameObject('Root');
    scene.add(root);

    const data = serializePrefab(scene);
    const instScene = instantiatePrefab(data, 'prefabs/test.prefab.json');
    const instRoot = instScene.roots[0]!;

    const targetScene = new Scene();
    targetScene.add(instRoot);

    expect(targetScene.roots).toHaveLength(1);
    expect(targetScene.roots[0]!.prefabSource).toBe('prefabs/test.prefab.json');
  });
});
