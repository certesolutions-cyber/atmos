import { GameObject } from './game-object.js';
import { _setSceneClass } from './component.js';

export type SceneLoader = (name: string) => void;

export class Scene {
  /** The currently active scene, set automatically by Engine. */
  static current: Scene | null = null;

  private static _sceneLoader: SceneLoader | null = null;

  /** Register a callback that handles scene loading by name. */
  static setSceneLoader(loader: SceneLoader | null): void {
    Scene._sceneLoader = loader;
  }

  /**
   * Request loading a scene by name (e.g. 'level2').
   * The registered loader will handle deserialization and scene swap.
   */
  static loadScene(name: string): void {
    if (!Scene._sceneLoader) {
      console.warn(`[Scene] No scene loader registered, cannot load "${name}"`);
      return;
    }
    Scene._sceneLoader(name);
  }

  private readonly _roots: GameObject[] = [];
  private readonly _allObjects: Set<GameObject> = new Set();
  private _started = false;

  get roots(): readonly GameObject[] {
    return this._roots;
  }

  add(gameObject: GameObject): void {
    if (this._allObjects.has(gameObject)) return;
    this._allObjects.add(gameObject);
    if (!gameObject.parent) {
      this._roots.push(gameObject);
    }
    // Recursively add all children
    for (const child of gameObject.children) {
      this.add(child);
    }
  }

  remove(gameObject: GameObject): void {
    if (!this._allObjects.has(gameObject)) return;
    // Recursively remove all children first
    for (const child of gameObject.children) {
      this.remove(child);
    }
    this._allObjects.delete(gameObject);
    const idx = this._roots.indexOf(gameObject);
    if (idx !== -1) this._roots.splice(idx, 1);

    // Destroy components (always, regardless of enabled state — must free GPU/physics resources)
    for (const comp of gameObject.getComponents()) {
      if (comp.onDestroy) comp.onDestroy();
    }
  }

  /**
   * Call onDestroy on components, then reset started flag so awakeAll/startAll fire again.
   * Optional filter: only destroy components where filter returns true.
   */
  destroyAllComponents(filter?: (comp: import('./component.js').Component) => boolean): void {
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.onDestroy && (!filter || filter(comp))) comp.onDestroy();
      }
    }
    this._started = false;
  }

  /** Call onPlayStart on all components. Used when entering play mode. */
  playStartAll(): void {
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.enabled && comp.onPlayStart) comp.onPlayStart();
      }
    }
  }

  /** Call onPlayStop on all components. Used when leaving play mode. */
  playStopAll(): void {
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.enabled && comp.onPlayStop) comp.onPlayStop();
      }
    }
    this._started = false;
  }

  awakeAll(): void {
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.enabled && comp.onAwake) comp.onAwake();
      }
    }
  }

  startAll(): void {
    if (this._started) return;
    this._started = true;
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.enabled && comp.onStart) comp.onStart();
      }
    }
  }

  updateAll(dt: number): void {
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.enabled && comp.onUpdate) comp.onUpdate(dt);
      }
    }
  }

  renderAll(): void {
    // Update transforms top-down (skip clean hierarchies)
    for (const root of this._roots) {
      if (root.transform.isDirty) {
        root.transform.updateWorldMatrix();
      }
    }
    // Call onRender on all components
    for (const obj of this._allObjects) {
      for (const comp of obj.getComponents()) {
        if (comp.enabled && comp.onRender) comp.onRender();
      }
    }
  }

  /**
   * Update root tracking for an object already in the scene.
   * Does NOT destroy components — safe to call during reparenting.
   */
  updateRootStatus(gameObject: GameObject): void {
    if (!this._allObjects.has(gameObject)) return;
    const idx = this._roots.indexOf(gameObject);
    if (!gameObject.parent && idx === -1) {
      this._roots.push(gameObject);
    } else if (gameObject.parent && idx !== -1) {
      this._roots.splice(idx, 1);
    }
  }

  getAllObjects(): ReadonlySet<GameObject> {
    return this._allObjects;
  }

  /** Find all components of a given type across the entire scene. */
  findAll<T extends import('./component.js').Component>(
    Ctor: new (...args: never[]) => T,
  ): T[] {
    const results: T[] = [];
    for (const obj of this._allObjects) {
      const comp = obj.getComponent(Ctor);
      if (comp) results.push(comp);
    }
    return results;
  }
}

// Break circular dependency: component.ts needs Scene.current but can't import Scene directly.
_setSceneClass(Scene);
