export type PropertyType = 'number' | 'string' | 'boolean' | 'vec3' | 'quat' | 'color' | 'enum' | 'gameObjectRef' | 'materialAsset' | 'texture' | 'button';

export interface PropertyDefBase {
  visibleWhen?: (target: unknown) => boolean;
  /** Override display label (defaults to humanized key). */
  label?: string;
  /** Group key for collapsible sections in the inspector. */
  group?: string;
  /** Custom getter — used instead of reading `target[key]`. */
  getter?: (target: unknown) => unknown;
  /** Custom setter — used instead of writing `target[key]`. */
  setter?: (target: unknown, value: unknown) => void;
  /** If false, skip this property during scene serialization. Default true. */
  serialize?: boolean;
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
  /** When present, inspector uses this instead of static `options` for dynamic enum values. */
  optionsFrom?: (target: unknown) => string[];
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

export interface TexturePropertyDef extends PropertyDefBase {
  key: string;
  type: 'texture';
}

export interface ButtonPropertyDef extends PropertyDefBase {
  key: string;
  type: 'button';
  /** Button label text (defaults to humanized key). */
  buttonLabel?: string;
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
  | MaterialAssetPropertyDef
  | TexturePropertyDef
  | ButtonPropertyDef;

export interface ComponentDef {
  name: string;
  properties: PropertyDef[];
  /** When true, multiple instances of this component can be added to the same GameObject. */
  allowMultiple?: boolean;
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
