export { Component } from './component.js';
export { GameObject, resetGameObjectIds } from './game-object.js';
export { Transform } from './transform.js';
export { Scene } from './scene.js';
export type { SceneLoader } from './scene.js';
export { Time } from './time.js';
export { Input } from './input.js';
export { Engine } from './engine.js';
export type { Renderer, PhysicsStepper } from './engine.js';
export {
  registerComponent,
  getComponentDef,
  getAllRegisteredComponents,
  clearRegistry,
} from './component-registry.js';
export type {
  PropertyDef,
  PropertyDefBase,
  PropertyType,
  ComponentDef,
  NumberPropertyDef,
  Vec3PropertyDef,
  QuatPropertyDef,
  ColorPropertyDef,
  EnumPropertyDef,
  StringPropertyDef,
  BooleanPropertyDef,
  GameObjectRefPropertyDef,
  MaterialAssetPropertyDef,
} from './component-registry.js';
export { registerCoreBuiltins } from './register-builtins.js';
export { serializeScene, deserializeScene, applyComponentData, serializePostProcess, applyPostProcess } from './scene-serializer.js';
export type { SceneData, GameObjectData, ComponentData, DeserializeContext, PostProcessData } from './scene-serializer.js';
