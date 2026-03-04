import { Component } from './component.js';
import { Transform } from './transform.js';

let nextId = 1;

export class GameObject {
  readonly id: number;
  readonly transform = new Transform();
  name: string;
  /** If true, this object and its children are skipped during serialization. */
  transient = false;

  /** Path to .prefab.json file. Only set on the prefab instance root. */
  prefabSource: string | null = null;

  /** When true, the editor prevents structural changes (add/remove components/children). */
  prefabLocked = false;

  private readonly _components: Component[] = [];
  private _parent: GameObject | null = null;
  private readonly _children: GameObject[] = [];

  constructor(name = 'GameObject') {
    this.id = nextId++;
    this.name = name;
  }

  get parent(): GameObject | null {
    return this._parent;
  }

  get children(): readonly GameObject[] {
    return this._children;
  }

  setParent(parent: GameObject | null): void {
    if (this._parent === parent) return;
    if (this._parent) {
      const idx = this._parent._children.indexOf(this);
      if (idx !== -1) this._parent._children.splice(idx, 1);
    }
    this._parent = parent;
    if (parent) {
      parent._children.push(this);
    }
    this.transform.setParent(parent ? parent.transform : null);
  }

  addComponent<T extends Component>(Ctor: new () => T): T {
    const component = new Ctor();
    component.gameObject = this;
    this._components.push(component);
    return component;
  }

  getComponent<T extends Component>(Ctor: new (...args: never[]) => T): T | null {
    for (const c of this._components) {
      if (c instanceof Ctor) return c;
    }
    // Fallback: walk prototype chain by name.
    // Handles duplicate module instances from Vite dynamic imports where instanceof fails.
    for (const c of this._components) {
      if (matchesByName(c, Ctor)) return c as T;
    }
    return null;
  }

  getComponents(): readonly Component[] {
    return this._components;
  }

  removeComponent(component: Component): void {
    const idx = this._components.indexOf(component);
    if (idx !== -1) {
      this._components.splice(idx, 1);
      if (component.onDestroy) component.onDestroy();
    }
  }
}

/**
 * Walk the component's prototype chain and check if any constructor name
 * matches the target class name. This handles cross-module duplicates
 * (e.g. Vite dynamic import loading the same .ts file twice) where
 * `instanceof` fails because the class identity differs.
 */
function matchesByName(comp: Component, Ctor: Function): boolean {
  const targetName = Ctor.name;
  if (!targetName) return false;
  let proto = Object.getPrototypeOf(comp) as object | null;
  while (proto && proto.constructor !== Object) {
    if (proto.constructor.name === targetName) return true;
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return false;
}

/** Reset ID counter (for testing only) */
export function resetGameObjectIds(): void {
  nextId = 1;
}
