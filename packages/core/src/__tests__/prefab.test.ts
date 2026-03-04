import { describe, it, expect, beforeEach } from 'vitest';
import { Scene } from '../scene.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';
import { clearRegistry } from '../component-registry.js';
import { registerCoreBuiltins } from '../register-builtins.js';
import { serializePrefab, deserializePrefab, instantiatePrefab, resolvePrefabInstances } from '../prefab.js';
import { serializeScene, deserializeScene } from '../scene-serializer.js';
import type { PrefabData } from '../prefab.js';

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

describe('serializeScene with prefab instances', () => {
  it('skips prefab children and saves only stub for prefab root', () => {
    const scene = new Scene();
    // Normal object
    const normal = new GameObject('Normal');
    scene.add(normal);

    // Prefab root + child (simulating an instantiated prefab)
    const prefabRoot = new GameObject('PrefabRoot');
    prefabRoot.prefabSource = 'prefabs/test.prefab.json';
    prefabRoot.prefabLocked = true;
    prefabRoot.transform.setPosition(5, 6, 7);
    const prefabChild = new GameObject('PrefabChild');
    prefabChild.prefabLocked = true;
    prefabChild.setParent(prefabRoot);
    scene.add(prefabRoot);
    scene.add(prefabChild);

    const data = serializeScene(scene);
    // Should contain: Normal + PrefabRoot stub (not PrefabChild)
    expect(data.gameObjects).toHaveLength(2);
    const names = data.gameObjects.map((o) => o.name);
    expect(names).toContain('Normal');
    expect(names).toContain('PrefabRoot');
    expect(names).not.toContain('PrefabChild');

    // Prefab root stub should have only Transform component
    const stub = data.gameObjects.find((o) => o.name === 'PrefabRoot')!;
    expect(stub.prefabSource).toBe('prefabs/test.prefab.json');
    expect(stub.prefabLocked).toBe(true);
    expect(stub.components).toHaveLength(1);
    expect(stub.components[0]!.type).toBe('Transform');
  });
});

describe('resolvePrefabInstances', () => {
  function makePrefabData(): { prefabData: ReturnType<typeof serializePrefab> } {
    const prefabScene = new Scene();
    const root = new GameObject('MyPrefab');
    root.transform.setPosition(0, 0, 0);
    const child = new GameObject('PrefabChild');
    child.setParent(root);
    prefabScene.add(root);
    prefabScene.add(child);
    return { prefabData: serializePrefab(prefabScene) };
  }

  it('replaces stubs with fresh prefab instances', async () => {
    const { prefabData } = makePrefabData();

    // Build a scene with a stub
    const scene = new Scene();
    const stub = new GameObject('MyInstance');
    stub.prefabSource = 'prefabs/test.prefab.json';
    stub.prefabLocked = true;
    stub.transform.setPosition(10, 20, 30);
    scene.add(stub);

    await resolvePrefabInstances(scene, async () => prefabData);

    const objects = [...scene.getAllObjects()];
    // Fresh instance: root + child
    expect(objects.length).toBeGreaterThanOrEqual(2);
    const freshRoot = scene.roots.find((r) => r.prefabSource === 'prefabs/test.prefab.json');
    expect(freshRoot).toBeDefined();
    // Name and transform preserved from stub
    expect(freshRoot!.name).toBe('MyInstance');
    expect(freshRoot!.transform.position[0]).toBeCloseTo(10);
    expect(freshRoot!.transform.position[1]).toBeCloseTo(20);
    expect(freshRoot!.transform.position[2]).toBeCloseTo(30);
    // Should have locked child
    expect(freshRoot!.children).toHaveLength(1);
    expect(freshRoot!.children[0]!.prefabLocked).toBe(true);
  });

  it('leaves stub as-is when prefab file is missing', async () => {
    const scene = new Scene();
    const stub = new GameObject('MissingPrefab');
    stub.prefabSource = 'prefabs/missing.prefab.json';
    stub.prefabLocked = true;
    scene.add(stub);

    await resolvePrefabInstances(scene, async () => null);

    const objects = [...scene.getAllObjects()];
    expect(objects).toHaveLength(1);
    expect(objects[0]!.name).toBe('MissingPrefab');
    expect(objects[0]!.prefabSource).toBe('prefabs/missing.prefab.json');
  });

  it('is a no-op when scene has no prefab stubs', async () => {
    const scene = new Scene();
    scene.add(new GameObject('Normal'));
    scene.add(new GameObject('AnotherNormal'));

    let loadCalled = false;
    await resolvePrefabInstances(scene, async () => { loadCalled = true; return null; });

    expect(loadCalled).toBe(false);
    expect([...scene.getAllObjects()]).toHaveLength(2);
  });

  it('full round-trip: instantiate → serialize → deserialize → resolve', async () => {
    // 1. Create a prefab (Cube root with 2 Sphere children)
    const prefabScene = new Scene();
    const prefabRoot = new GameObject('Cube');
    prefabRoot.transform.setPosition(0, 0, 0);
    const child1 = new GameObject('Sphere');
    child1.transform.setPosition(0, 0.5, 0);
    child1.setParent(prefabRoot);
    const child2 = new GameObject('Sphere');
    child2.transform.setPosition(0.7, 0, 0);
    child2.setParent(prefabRoot);
    prefabScene.add(prefabRoot);
    prefabScene.add(child1);
    prefabScene.add(child2);
    const prefabData = serializePrefab(prefabScene);

    // 2. Build a scene with normal objects + 2 prefab instances
    const mainScene = new Scene();
    const plane = new GameObject('Plane');
    mainScene.add(plane);

    const inst1Scene = instantiatePrefab(prefabData, 'prefabs/my-prefab.prefab.json');
    const inst1 = inst1Scene.roots[0]!;
    inst1.name = 'Instance1';
    inst1.transform.setPosition(2, 0, 0);
    mainScene.add(inst1);

    const inst2Scene = instantiatePrefab(prefabData, 'prefabs/my-prefab.prefab.json');
    const inst2 = inst2Scene.roots[0]!;
    inst2.name = 'Instance2';
    inst2.transform.setPosition(-5, 0, 0);
    mainScene.add(inst2);

    // Verify scene before save: 1 plane + 2 instances × 3 objects = 7
    expect([...mainScene.getAllObjects()]).toHaveLength(7);
    expect(inst1.children).toHaveLength(2);
    expect(inst2.children).toHaveLength(2);

    // 3. Serialize the scene (stubs only for prefab instances)
    const sceneData = serializeScene(mainScene);
    // Only 3 entries: Plane + 2 stubs (children skipped)
    expect(sceneData.gameObjects).toHaveLength(3);

    // 4. Deserialize → only stubs exist (no children yet)
    const loadedScene = deserializeScene(sceneData);
    expect([...loadedScene.getAllObjects()]).toHaveLength(3);
    const stub1 = [...loadedScene.getAllObjects()].find((o) => o.name === 'Instance1');
    expect(stub1).toBeDefined();
    expect(stub1!.children).toHaveLength(0); // no children yet
    expect(stub1!.prefabSource).toBe('prefabs/my-prefab.prefab.json');

    // 5. Resolve prefab instances → children restored
    const loader = async (_path: string): Promise<PrefabData | null> => prefabData;
    await resolvePrefabInstances(loadedScene, loader);

    // 1 plane + 2 fresh instances × 3 objects = 7
    expect([...loadedScene.getAllObjects()]).toHaveLength(7);

    const resolved1 = loadedScene.roots.find((r) => r.name === 'Instance1');
    expect(resolved1).toBeDefined();
    expect(resolved1!.children).toHaveLength(2);
    expect(resolved1!.prefabSource).toBe('prefabs/my-prefab.prefab.json');
    expect(resolved1!.transform.position[0]).toBeCloseTo(2);

    const resolved2 = loadedScene.roots.find((r) => r.name === 'Instance2');
    expect(resolved2).toBeDefined();
    expect(resolved2!.children).toHaveLength(2);
    expect(resolved2!.transform.position[0]).toBeCloseTo(-5);

    // All prefab nodes are locked
    for (const child of resolved1!.children) {
      expect(child.prefabLocked).toBe(true);
    }
  });
});
