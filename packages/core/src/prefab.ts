import { Scene } from './scene.js';
import { GameObject } from './game-object.js';
import { serializeScene, deserializeScene } from './scene-serializer.js';
import type { GameObjectData, DeserializeContext } from './scene-serializer.js';

export interface PrefabData {
  version: 1;
  gameObjects: GameObjectData[];
}

/**
 * Serialize the current scene as a prefab.
 * The scene must contain exactly one root (non-transient) GameObject.
 */
export function serializePrefab(scene: Scene): PrefabData {
  const roots = scene.roots.filter((r) => !r.transient);
  if (roots.length === 0) throw new Error('EMPTY_SCENE');
  if (roots.length > 1) throw new Error('MULTIPLE_ROOTS');
  const sceneData = serializeScene(scene);
  return { version: 1, gameObjects: sceneData.gameObjects };
}

/**
 * Deserialize a prefab into a scene for editing.
 * Returns a Scene containing the prefab's GameObjects (unlocked).
 */
export function deserializePrefab(data: PrefabData, context?: DeserializeContext): Scene {
  return deserializeScene({ gameObjects: data.gameObjects }, context);
}

/**
 * Instantiate a prefab as a locked subtree.
 * Returns a temporary Scene whose single root can be moved into the target scene.
 * The root gets `prefabSource` set and all nodes get `prefabLocked = true`.
 */
export function instantiatePrefab(data: PrefabData, prefabPath: string, context?: DeserializeContext): Scene {
  const scene = deserializeScene({ gameObjects: data.gameObjects }, context);
  const roots = scene.roots.filter((r) => !r.transient);
  if (roots.length !== 1) throw new Error('INVALID_PREFAB');
  const root = roots[0]!;
  root.prefabSource = prefabPath;
  lockSubtree(root);
  return scene;
}

/** Set `prefabLocked = true` on a GameObject and all its descendants. */
export function lockSubtree(go: GameObject): void {
  go.prefabLocked = true;
  for (const child of go.children) {
    lockSubtree(child);
  }
}

/** Callback that loads a prefab file by path, returning null on failure. */
export type PrefabLoader = (path: string) => Promise<PrefabData | null>;

/**
 * Replace prefab reference stubs in a scene with fresh prefab instances.
 * Stubs are GameObjects with `prefabSource` set. For each stub the prefab
 * file is loaded (and cached), instantiated, and the stub is swapped out
 * while preserving name, transform, and parent.
 */
export async function resolvePrefabInstances(
  scene: Scene,
  loadPrefab: PrefabLoader,
  context?: DeserializeContext,
): Promise<void> {
  const stubs = [...scene.getAllObjects()].filter((o) => o.prefabSource);
  if (stubs.length === 0) return;

  const cache = new Map<string, PrefabData | null>();

  for (const stub of stubs) {
    const prefabPath = stub.prefabSource!;

    // Cache-load prefab data
    if (!cache.has(prefabPath)) {
      cache.set(prefabPath, await loadPrefab(prefabPath));
    }
    const data = cache.get(prefabPath)!;
    if (!data) {
      console.warn(`[Prefab] Missing prefab file: ${prefabPath} — leaving stub as-is`);
      continue;
    }

    // Instantiate fresh locked subtree
    const tempScene = instantiatePrefab(data, prefabPath, context);
    if (context?.onComplete) await context.onComplete();
    const freshRoot = tempScene.roots.filter((r) => !r.transient)[0];
    if (!freshRoot) continue;

    // Copy stub's name, transform, parent
    freshRoot.name = stub.name;
    const sp = stub.transform.position;
    const sr = stub.transform.rotation;
    const ss = stub.transform.scale;
    freshRoot.transform.setPosition(sp[0]!, sp[1]!, sp[2]!);
    freshRoot.transform.setRotation(sr[0]!, sr[1]!, sr[2]!, sr[3]!);
    freshRoot.transform.setScale(ss[0]!, ss[1]!, ss[2]!);

    if (stub.parent) freshRoot.setParent(stub.parent);

    // Swap: remove stub, add fresh
    scene.remove(stub);
    scene.add(freshRoot);
  }
}
