import type { Scene, GameObject } from '@certe/atmos-core';
import type { GizmoMode } from './gizmo-state.js';
import { takeSnapshot, restoreSnapshot } from './scene-snapshot.js';
import type { SceneSnapshot } from './scene-snapshot.js';
import type { AssetEntry, ScriptAsset } from './asset-types.js';
import type { ProjectFileSystem } from './project-fs.js';
import type { MaterialManager } from './material-manager.js';
import type { ProjectSettingsManager } from './project-settings.js';

export type EditorTool = 'select' | 'treeBrush';
export type BrushMode = 'tree' | 'detail' | 'texture';

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
  | 'materialSelected'
  | 'wireframeChanged'
  | 'settingsChanged'
  | 'toolChanged';

type Listener = () => void;

export class EditorState {
  scene: Scene;
  paused = true;
  gizmoMode: GizmoMode = 'translate';
  snapEnabled = false;
  snapSize = 1.0;
  assetEntries: AssetEntry[] = [];
  scriptAssets: ScriptAsset[] = [];
  projectFs: ProjectFileSystem | null = null;
  materialManager: MaterialManager | null = null;
  settingsManager: ProjectSettingsManager | null = null;
  selectedMaterialPath: string | null = null;
  wireframeEnabled = false;
  tool: EditorTool = 'select';
  brushMode: BrushMode = 'tree';
  private _sceneName = _getSessionItem('atmos:sceneName') ?? 'main';

  get sceneName(): string { return this._sceneName; }
  set sceneName(v: string) {
    this._sceneName = v;
    _setSessionItem('atmos:sceneName', v);
  }

  private readonly _selection = new Set<GameObject>();
  private _playSnapshot: SceneSnapshot | null = null;
  private readonly _listeners = new Map<EditorEvent, Set<Listener>>();

  /** Single-selection backward compat: returns the object when exactly one is selected. */
  get selected(): GameObject | null {
    if (this._selection.size === 1) return this._selection.values().next().value!;
    return null;
  }

  /** The full selection set (read-only). */
  get selection(): ReadonlySet<GameObject> {
    return this._selection;
  }

  constructor(scene: Scene) {
    this.scene = scene;
  }

  select(obj: GameObject | null): void {
    if (obj) {
      if (this._selection.size === 1 && this._selection.has(obj)) return;
      this._selection.clear();
      this._selection.add(obj);
    } else {
      if (this._selection.size === 0) return;
      this._selection.clear();
    }
    this.selectedMaterialPath = null;
    this._emit('selectionChanged');
    this._emit('materialSelected');
  }

  toggleSelect(obj: GameObject): void {
    if (this._selection.has(obj)) {
      this._selection.delete(obj);
    } else {
      this._selection.add(obj);
    }
    this.selectedMaterialPath = null;
    this._emit('selectionChanged');
    this._emit('materialSelected');
  }

  addToSelection(objects: GameObject[]): void {
    for (const obj of objects) this._selection.add(obj);
    this.selectedMaterialPath = null;
    this._emit('selectionChanged');
    this._emit('materialSelected');
  }

  isSelected(obj: GameObject): boolean {
    return this._selection.has(obj);
  }

  removeFromSelection(obj: GameObject): void {
    if (this._selection.delete(obj)) {
      this._emit('selectionChanged');
    }
  }

  selectMaterial(path: string | null): void {
    if (this.selectedMaterialPath === path) return;
    this.selectedMaterialPath = path;
    this._selection.clear();
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
    this._selection.clear();
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

  setWireframe(on: boolean): void {
    if (this.wireframeEnabled === on) return;
    this.wireframeEnabled = on;
    this._emit('wireframeChanged');
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

  setSettingsManager(sm: ProjectSettingsManager): void {
    this.settingsManager = sm;
    this._emit('settingsChanged');
  }

  setTool(tool: EditorTool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    this._emit('toolChanged');
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

function _getSessionItem(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function _setSessionItem(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* noop */ }
}
