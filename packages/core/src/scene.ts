import { GameObject } from './game-object.js';

export class Scene {
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
  }

  remove(gameObject: GameObject): void {
    if (!this._allObjects.has(gameObject)) return;
    this._allObjects.delete(gameObject);
    const idx = this._roots.indexOf(gameObject);
    if (idx !== -1) this._roots.splice(idx, 1);

    // Destroy components (always, regardless of enabled state — must free GPU/physics resources)
    for (const comp of gameObject.getComponents()) {
      if (comp.onDestroy) comp.onDestroy();
    }
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
}
