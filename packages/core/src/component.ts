import type { GameObject } from './game-object.js';
import type { Scene } from './scene.js';

/** Set by Scene module at import time to break circular dependency. */
let _sceneClass: typeof Scene | null = null;
export function _setSceneClass(cls: typeof Scene): void { _sceneClass = cls; }

export abstract class Component {
  gameObject!: GameObject;
  enabled = true;

  onAwake?(): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onRender?(): void;
  onDestroy?(): void;

  /** Get a sibling component on the same GameObject. */
  getComponent<T extends Component>(Ctor: new (...args: never[]) => T): T | null {
    return this.gameObject.getComponent(Ctor);
  }

  /** Get all sibling components of a given type on the same GameObject. */
  getAllComponents<T extends Component>(Ctor: new (...args: never[]) => T): T[] {
    return this.gameObject.getComponents().filter((c): c is T => c instanceof Ctor);
  }

  /** Find all components of a given type in the current scene. */
  static findAll<T extends Component>(Ctor: new (...args: never[]) => T): T[] {
    const current = _sceneClass?.current;
    if (!current) return [];
    return current.findAll(Ctor);
  }
}
