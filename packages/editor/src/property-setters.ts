import type { PropertyDef } from '@atmos/core';

function navigatePath(obj: unknown, parts: string[]): { target: Record<string, unknown>; key: string } | null {
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[parts[i]!];
  }
  if (current == null || typeof current !== 'object') return null;
  return { target: current as Record<string, unknown>, key: parts[parts.length - 1]! };
}

export function getProperty(component: unknown, def: PropertyDef): unknown {
  const parts = def.key.split('.');
  const nav = navigatePath(component, parts);
  if (!nav) return undefined;
  const value = nav.target[nav.key];

  if (value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

export function setProperty(component: unknown, def: PropertyDef, value: unknown): void {
  const parts = def.key.split('.');
  const nav = navigatePath(component, parts);
  if (!nav) return;

  const existing = nav.target[nav.key];

  if (existing instanceof Float32Array && Array.isArray(value)) {
    for (let i = 0; i < value.length && i < existing.length; i++) {
      existing[i] = value[i] as number;
    }
  } else {
    nav.target[nav.key] = value;
  }

  // Mark transform dirty so the scene re-renders immediately
  const comp = component as Record<string, unknown>;
  // If the target itself is a Transform (e.g. editing position/rotation/scale directly)
  if (typeof comp['markDirty'] === 'function') {
    (comp['markDirty'] as () => void)();
  }
  // If the target is a Component with gameObject.transform
  const go = comp['gameObject'] as Record<string, unknown> | undefined;
  if (go) {
    const transform = go['transform'] as { markDirty?: () => void } | undefined;
    transform?.markDirty?.();
  }

  // If we navigated through 'material', mark it dirty
  if (parts[0] === 'material' && comp['material']) {
    (comp['material'] as Record<string, unknown>)['dirty'] = true;
  }
}
