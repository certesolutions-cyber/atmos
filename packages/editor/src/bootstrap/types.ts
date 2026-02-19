import type { Component, Engine, Scene, GameObject, DeserializeContext, PhysicsStepper } from '@atmos/core';
import type { GPUContext, PipelineResources, Mesh, CameraSettings, RenderSystem } from '@atmos/renderer';
import type { EditorState } from '../editor-state.js';
import type { GizmoState } from '../gizmo-state.js';
import type { OrbitCamera } from '../orbit-camera.js';
import type { ProjectFileSystem } from '../project-fs.js';
import type { MaterialManager } from '../material-manager.js';
import type { PrimitiveType } from '../editor-mount.js';
import type { ScriptAsset } from '../asset-types.js';

// ---- Physics plugin (implemented by @atmos/physics) ---- //

/** Minimal mesh interface for collider auto-sizing (avoids importing @atmos/renderer in physics) */
export interface MeshLike {
  vertices?: Float32Array;
  vertexStride?: number;
}

/** Context provided to the physics plugin during initialization. */
export interface PhysicsInitContext {
  /** Named primitive meshes — keys: cube, plane, sphere, cylinder */
  meshes: Record<string, unknown>;
  /** Read MeshRenderer.mesh from a GameObject without importing @atmos/renderer */
  getMesh(go: GameObject): MeshLike | null;
}

/** Physics plugin interface. @atmos/physics provides createEditorPhysics() that returns this. */
export interface EditorPhysicsPlugin {
  /** Initialize: map meshes to collider shapes. */
  init(ctx: PhysicsInitContext): void;
  /** Create a physics stepper for the given scene. */
  createStepper(scene: Scene): PhysicsStepper & { scene: Scene };
  /** Check if a component can be added. Returns null if OK, or a reason string. */
  canAddComponent(ctor: new () => Component, go: GameObject): string | null;
  /** Try adding a physics component. Returns true if handled. */
  handleAddComponent(ctor: new () => Component, go: GameObject): boolean;
  /** Try removing a physics component. Returns true if handled. */
  handleRemoveComponent(comp: Component, go: GameObject): boolean;
  /** Try deserializing a physics component. Returns true if handled. */
  handleDeserialize(
    go: GameObject, type: string, data: Record<string, unknown>,
    deferred: Array<() => void>,
  ): boolean;
  /** Flush deferred operations (e.g. joint connectedObject). */
  flushDeferred(ops: Array<() => void>): void;
  /** Install reparent validator + callback for nested-RigidBody prevention. */
  installReparentHooks(
    setValidator: (fn: ((child: GameObject, newParent: GameObject | null) => boolean) | null) => void,
    setCallback: (fn: ((child: GameObject) => void) | null) => void,
  ): void;
  /** Sync physics system when scene changes. */
  onSceneChanged(scene: Scene): void;
  /** Teleport RigidBodies after play-mode snapshot restore. */
  onSceneRestored(scene: Scene): void;
}

// ---- startEditor config & result ---- //

/** Context provided to the setupScene callback. */
export interface SceneSetupContext {
  scene: Scene;
  gpu: GPUContext;
  pipeline: PipelineResources;
  meshes: Record<Exclude<PrimitiveType, 'camera'>, Mesh>;
}

export interface EditorConfig {
  /** Canvas element to render into. Created automatically if omitted. */
  canvas?: HTMLCanvasElement;
  /** Container element for the React editor UI. Created automatically if omitted. */
  container?: HTMLElement;
  /** Optional physics plugin (from @atmos/physics createEditorPhysics()). */
  physics?: EditorPhysicsPlugin;
  /** Optional callback to populate the initial scene. */
  setupScene?: (ctx: SceneSetupContext) => void;
  /** User script assets to register in the editor. */
  scripts?: ScriptAsset[];
  /** Raw eager-loaded modules from import.meta.glob(). Processed internally via discoverScripts(). */
  scriptModules?: Record<string, Record<string, unknown>>;
  /** Override the default primitive factory. */
  primitiveFactory?: (type: PrimitiveType, name: string) => GameObject;
  /** Override the default component factory. */
  componentFactory?: (ctor: new () => Component, go: GameObject) => void;
  /** Override the default deserialize context. */
  deserializeContext?: DeserializeContext;
  /** Show asset browser panel. Default: true. */
  showAssetBrowser?: boolean;
  /** Callback invoked when a script is attached to a GameObject. */
  onAttachScript?: (script: ScriptAsset, go: GameObject) => void;
}

/** Return value of startEditor(). */
export interface EditorApp {
  editorState: EditorState;
  engine: Engine;
  gizmoState: GizmoState | undefined;
  orbitCamera: OrbitCamera | undefined;
  renderSystem: RenderSystem;
  scene: Scene;
  gpu: GPUContext;
  projectFs: ProjectFileSystem;
  materialManager: MaterialManager | null;
  /** Open a project directory (shows picker). After opening, seeds + creates MaterialManager. */
  openProject(): Promise<boolean>;
  /** Tear down everything and stop the engine. */
  dispose(): void;
}
