import type { GameObject, Component } from '@certe/atmos-core';

/** Walk up the parent chain (including self) to find the first component of type Ctor. */
export function findAncestorComponent<T extends Component>(
  go: GameObject,
  Ctor: new (...args: never[]) => T,
): T | null {
  let current: GameObject | null = go;
  while (current) {
    const c = current.getComponent(Ctor);
    if (c) return c;
    current = current.parent;
  }
  return null;
}

/** Check whether any ancestor (excluding self) has a component of type Ctor. */
export function hasAncestorComponent<T extends Component>(
  go: GameObject,
  Ctor: new (...args: never[]) => T,
): boolean {
  let current = go.parent;
  while (current) {
    if (current.getComponent(Ctor)) return true;
    current = current.parent;
  }
  return false;
}

/** Check whether any descendant (excluding self) has a component of type Ctor. */
export function hasDescendantComponent<T extends Component>(
  go: GameObject,
  Ctor: new (...args: never[]) => T,
): boolean {
  for (const child of go.children) {
    if (child.getComponent(Ctor)) return true;
    if (hasDescendantComponent(child, Ctor)) return true;
  }
  return false;
}
