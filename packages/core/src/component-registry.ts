import type { Component } from './component.js';

export type PropertyType = 'number' | 'string' | 'boolean' | 'vec3' | 'quat' | 'color' | 'enum' | 'gameObjectRef' | 'materialAsset';

export interface PropertyDefBase {
  visibleWhen?: (target: unknown) => boolean;
}

export interface NumberPropertyDef extends PropertyDefBase {
  key: string;
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface Vec3PropertyDef extends PropertyDefBase {
  key: string;
  type: 'vec3';
}

export interface QuatPropertyDef extends PropertyDefBase {
  key: string;
  type: 'quat';
}

export interface ColorPropertyDef extends PropertyDefBase {
  key: string;
  type: 'color';
}

export interface EnumPropertyDef extends PropertyDefBase {
  key: string;
  type: 'enum';
  options: string[];
}

export interface StringPropertyDef extends PropertyDefBase {
  key: string;
  type: 'string';
}

export interface BooleanPropertyDef extends PropertyDefBase {
  key: string;
  type: 'boolean';
}

export interface GameObjectRefPropertyDef extends PropertyDefBase {
  key: string;
  type: 'gameObjectRef';
}

export interface MaterialAssetPropertyDef extends PropertyDefBase {
  key: string;
  type: 'materialAsset';
}

export type PropertyDef =
  | NumberPropertyDef
  | Vec3PropertyDef
  | QuatPropertyDef
  | ColorPropertyDef
  | EnumPropertyDef
  | StringPropertyDef
  | BooleanPropertyDef
  | GameObjectRefPropertyDef
  | MaterialAssetPropertyDef;

export interface ComponentDef {
  name: string;
  properties: PropertyDef[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry key must accept any class (Component, Transform, etc.)
type ComponentConstructor = abstract new (...args: any[]) => any;

const registry = new Map<ComponentConstructor, ComponentDef>();

export function registerComponent(ctor: ComponentConstructor, def: ComponentDef): void {
  registry.set(ctor, def);
}

export function getComponentDef(ctor: ComponentConstructor): ComponentDef | undefined {
  return registry.get(ctor);
}

export function getAllRegisteredComponents(): Map<ComponentConstructor, ComponentDef> {
  return new Map(registry);
}

export function clearRegistry(): void {
  registry.clear();
}
