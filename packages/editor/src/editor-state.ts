import type { Scene, GameObject } from '@atmos/core';
import type { GizmoMode } from './gizmo-state.js';
import { takeSnapshot, restoreSnapshot } from './scene-snapshot.js';
import type { SceneSnapshot } from './scene-snapshot.js';
import type { AssetEntry, ScriptAsset } from './asset-types.js';
import type { ProjectFileSystem } from './project-fs.js';
import type { MaterialManager } from './material-manager.js';

export type EditorEvent =
  | 'selectionChanged'
  | 'sceneChanged'
  | 'pauseChanged'
  | 'gizmoModeChanged'
  | 'snapChanged'
  | 'inspectorChanged'
  | 'sceneRestored'
  | 'assetsChanged'
  | 'scriptsChanged'
  | 'projectChanged'
  | 'materialSelected';

type Listener = () => void;

export class EditorState {
  scene: Scene;
  selected: GameObject | null = null;
  paused = true;
  gizmoMode: GizmoMode = 'translate';
  snapEnabled = false;
  snapSize = 1.0;
  assetEntries: AssetEntry[] = [];
  scriptAssets: ScriptAsset[] = [];
  projectFs: ProjectFileSystem | null = null;
  materialManager: MaterialManager | null = null;
  selectedMaterialPath: string | null = null;

  private _playSnapshot: SceneSnapshot | null = null;
  private readonly _listeners = new Map<EditorEvent, Set<Listener>>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  select(obj: GameObject | null): void {
    if (this.selected === obj) return;
    this.selected = obj;
    this.selectedMaterialPath = null;
    this._emit('selectionChanged');
    this._emit('materialSelected');
  }

  selectMaterial(path: string | null): void {
    if (this.selectedMaterialPath === path) return;
    this.selectedMaterialPath = path;
    this.selected = null;
    this._emit('materialSelected');
    this._emit('selectionChanged');
  }

  deselect(): void {
    this.select(null);
  }

  togglePause(): void {
    if (this.paused) {
      // Entering play mode — save snapshot
      this._playSnapshot = takeSnapshot(this.scene);
    }
    this.paused = !this.paused;
    this._emit('pauseChanged');
    if (this.paused && this._playSnapshot) {
      // Returning to edit mode — restore snapshot
      restoreSnapshot(this.scene, this._playSnapshot);
      this._playSnapshot = null;
      this._emit('sceneRestored');
    }
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.selected = null;
    this._emit('sceneChanged');
    this._emit('selectionChanged');
  }

  setGizmoMode(mode: GizmoMode): void {
    if (this.gizmoMode === mode) return;
    this.gizmoMode = mode;
    this._emit('gizmoModeChanged');
  }

  toggleSnap(): void {
    this.snapEnabled = !this.snapEnabled;
    this._emit('snapChanged');
  }

  /** Notify inspector that property values may have changed (e.g., gizmo drag, physics sync) */
  notifyInspectorChanged(): void {
    this._emit('inspectorChanged');
  }

  setAssetEntries(entries: AssetEntry[]): void {
    this.assetEntries = entries;
    this._emit('assetsChanged');
  }

  setScriptAssets(scripts: ScriptAsset[]): void {
    this.scriptAssets = scripts;
    this._emit('scriptsChanged');
  }

  setProjectFs(fs: ProjectFileSystem, mm: MaterialManager): void {
    this.projectFs = fs;
    this.materialManager = mm;
    this._emit('projectChanged');
  }

  on(event: EditorEvent, fn: Listener): () => void {
    let listeners = this._listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(event, listeners);
    }
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  private _emit(event: EditorEvent): void {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const fn of listeners) {
      fn();
    }
  }
}
