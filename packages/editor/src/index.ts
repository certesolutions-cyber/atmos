export { EditorState } from './editor-state.js';
export type { EditorEvent } from './editor-state.js';
export { mountEditor } from './editor-mount.js';
export type { MountEditorOptions, MountEditorResult, PrimitiveType } from './editor-mount.js';
export { getProperty, setProperty } from './property-setters.js';
export { OrbitCamera } from './orbit-camera.js';
export { ObjectPicker } from './object-picker.js';
export type { PickResult } from './object-picker.js';
export { GizmoState } from './gizmo-state.js';
export type { GizmoMode, GizmoAxis } from './gizmo-state.js';
export { GizmoRenderer } from './gizmo-renderer.js';
export { OverlayRenderer } from './overlay-renderer.js';
export { CAMERA_PRESETS, applyCameraPreset } from './camera-presets.js';
export type { CameraPreset } from './camera-presets.js';
export {
  findObjectById,
  duplicateGameObject,
  deleteGameObject,
  canReparent,
  reparentGameObject,
  setReparentValidator,
  setOnReparent,
} from './scene-operations.js';
export type { ReparentValidator, ReparentCallback } from './scene-operations.js';
export { takeSnapshot, restoreSnapshot } from './scene-snapshot.js';
export type { SceneSnapshot } from './scene-snapshot.js';
export { AssetBrowserClient } from './asset-browser-client.js';
export type { AssetEntry, AssetListResponse, AssetChangeEvent, ScriptAsset } from './asset-types.js';
export { discoverScripts, autoDiscoverScripts } from './script-discovery.js';
export { ProjectFileSystem } from './project-fs.js';
export { MaterialManager } from './material-manager.js';
export { startEditor } from './bootstrap/start-editor.js';
export type {
  EditorConfig,
  EditorApp,
  EditorPhysicsPlugin,
  SceneSetupContext,
  MeshLike,
  PhysicsInitContext,
} from './bootstrap/types.js';
