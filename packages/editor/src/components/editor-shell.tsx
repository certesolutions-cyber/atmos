import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Scene, serializeScene, deserializeScene, serializePostProcess, applyPostProcess, serializePrefab } from '@certe/atmos-core';
import type { DeserializeContext, Component, GameObject } from '@certe/atmos-core';
import type { EditorState } from '../editor-state.js';
import type { OrbitCamera } from '../orbit-camera.js';
import type { ProjectFileSystem } from '../project-fs.js';
import { CAMERA_PRESETS, applyCameraPreset } from '../camera-presets.js';
import { HierarchyPanel } from './hierarchy-panel.js';
import { InspectorPanel } from './inspector-panel.js';
import { AssetBrowserPanel } from './asset-browser-panel.js';
import { ProjectGate } from './project-gate.js';
import { PostProcessPanel } from './post-process-panel.js';
import { SettingsPanel } from './settings-panel.js';
import { useSplitter } from './use-splitter.js';
import type { GizmoMode } from '../gizmo-state.js';
import type { PrimitiveType } from '../editor-mount.js';
import type { ScriptAsset, AssetEntry } from '../asset-types.js';

interface EditorShellProps {
  editorState: EditorState;
  projectFs: ProjectFileSystem;
  onOpenProject: () => Promise<void>;
  deserializeContext?: DeserializeContext;
  componentFactory?: (ctor: new () => Component, go: GameObject) => void;
  componentFilter?: (ctor: new () => Component, go: GameObject) => string | null;
  componentRemover?: (comp: Component, go: GameObject) => void;
  primitiveFactory?: (type: PrimitiveType, name: string) => GameObject;
  orbitCamera?: OrbitCamera;
  canvas?: HTMLCanvasElement;
  showAssetBrowser?: boolean;
  onAttachScript?: (script: ScriptAsset, go: GameObject) => void;
  onLoadModel?: (entry: AssetEntry) => void;
  onLoadScene?: (entry: AssetEntry) => void;
  onDropModel?: (path: string, target: GameObject | null) => void;
  onDropPrefab?: (path: string, parent: GameObject | null) => void;
  onLoadPrefab?: (entry: AssetEntry) => void;
  renderSystem?: import('@certe/atmos-renderer').RenderSystem;
}

/* ── Layout ─────────────────────────────────────────── */

const shellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  color: '#c8c8c8',
  background: '#181818',
  fontSize: '12px',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 12px',
  background: '#1f1f1f',
  borderBottom: '1px solid #2a2a2a',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
};

const viewportStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
  background: '#111',
};

const canvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

/* ── Toolbar elements ───────────────────────────────── */

const btnBase: React.CSSProperties = {
  background: '#2c2c2c',
  color: '#b8b8b8',
  border: '1px solid #3a3a3a',
  borderRadius: '4px',
  padding: '4px 10px',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: '16px',
  transition: 'background 0.1s, border-color 0.1s',
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: '#1a4a7a',
  borderColor: '#3388cc',
  color: '#e8e8e8',
};

const btnAccent: React.CSSProperties = {
  ...btnBase,
  background: '#1a6a3a',
  borderColor: '#2a8a4a',
  color: '#e8e8e8',
};

const selectBase: React.CSSProperties = {
  ...btnBase,
  padding: '4px 6px',
  appearance: 'auto' as React.CSSProperties['appearance'],
};

const sepStyle: React.CSSProperties = {
  width: '1px',
  height: '18px',
  background: '#333',
  margin: '0 4px',
  flexShrink: 0,
};

const groupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#666',
  marginRight: '2px',
  userSelect: 'none',
};

/* ── Global: hide number-input spinners ────────────── */

const HIDE_SPINNERS_CSS = `
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  [data-atmos-toolbar] button:active {
    filter: brightness(1.4);
    transform: scale(0.96);
  }
  [data-atmos-toolbar] button:hover,
  [data-atmos-toolbar] select:hover {
    filter: brightness(1.15);
  }
`;

/* ── Component ──────────────────────────────────────── */

export function EditorShell({
  editorState, projectFs, onOpenProject, deserializeContext, componentFactory, componentFilter, componentRemover,
  primitiveFactory, orbitCamera, canvas,
  showAssetBrowser, onAttachScript, onLoadModel, onLoadScene, onDropModel, onDropPrefab, onLoadPrefab, renderSystem,
}: EditorShellProps) {
  const [, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Resizable panel sizes
  const [hierarchyWidth, setHierarchyWidth] = useState(200);
  const [inspectorWidth, setInspectorWidth] = useState(260);
  const [assetBrowserHeight, setAssetBrowserHeight] = useState(180);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const hierarchySplitter = useSplitter('horizontal', useCallback((d: number) => {
    setHierarchyWidth((w) => clamp(w + d, 120, 400));
  }, []));
  const inspectorSplitter = useSplitter('horizontal', useCallback((d: number) => {
    setInspectorWidth((w) => clamp(w - d, 180, 500));
  }, []));
  const assetSplitter = useSplitter('vertical', useCallback((d: number) => {
    setAssetBrowserHeight((h) => clamp(h - d, 80, 400));
  }, []));

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // Inject global style to hide number-input spinners (once)
  useEffect(() => {
    const id = 'atmos-hide-spinners';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = HIDE_SPINNERS_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // Move canvas into viewport slot on mount, and adopt #atmos-ui overlay
  useEffect(() => {
    if (viewportRef.current && canvas) {
      Object.assign(canvas.style, canvasStyle);
      canvas.style.visibility = 'visible';
      canvas.style.position = 'static';
      viewportRef.current.appendChild(canvas);

      // Move user's #atmos-ui overlay into the viewport so it renders on top of the canvas
      const uiOverlay = document.getElementById('atmos-ui');
      if (uiOverlay) {
        Object.assign(uiOverlay.style, {
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        });
        viewportRef.current.appendChild(uiOverlay);
      }
    }
  }, [canvas]);

  useEffect(() => {
    const unsub1 = editorState.on('pauseChanged', () => setTick((t) => t + 1));
    const unsub2 = editorState.on('gizmoModeChanged', () => setTick((t) => t + 1));
    const unsub3 = editorState.on('projectChanged', () => setTick((t) => t + 1));
    const unsub4 = editorState.on('settingsChanged', () => setTick((t) => t + 1));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [editorState]);

  const handleSave = useCallback(async () => {
    const projectFs = editorState.projectFs;
    const data = serializeScene(editorState.scene);
    if (renderSystem) data.postProcess = serializePostProcess(renderSystem as unknown as Record<string, unknown>);
    const json = JSON.stringify(data, null, 2);
    if (projectFs?.isOpen) {
      let name = editorState.sceneName;
      if (!name) {
        const input = window.prompt('Scene name:', 'main');
        if (!input) return;
        name = input.trim().replace(/\.scene\.json$/i, '');
        if (!name) return;
      }
      editorState.sceneName = name;
      await projectFs.writeFile(`scenes/${name}.scene.json`, json);
      // Update defaultScene in project settings so builds use this scene
      if (editorState.settingsManager) {
        editorState.settingsManager.updateDefaultScene(name);
      }
      showToast(`Saved ${name}.scene.json`);
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scene.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [editorState]);

  const handleSaveAs = useCallback(async () => {
    const projectFs = editorState.projectFs;
    if (!projectFs?.isOpen) return;
    const data = serializeScene(editorState.scene);
    if (renderSystem) data.postProcess = serializePostProcess(renderSystem as unknown as Record<string, unknown>);
    const json = JSON.stringify(data, null, 2);
    const input = window.prompt('Scene name:', editorState.sceneName || 'main');
    if (!input) return;
    const name = input.trim().replace(/\.scene\.json$/i, '');
    if (!name) return;
    editorState.sceneName = name;
    await projectFs.writeFile(`scenes/${name}.scene.json`, json);
  }, [editorState]);

  const handleSaveAsPrefab = useCallback(async () => {
    const pfs = editorState.projectFs;
    if (!pfs?.isOpen) return;
    // Count non-transient roots
    const roots = editorState.scene.roots.filter((r) => !r.transient);
    if (roots.length === 0) return;
    if (roots.length > 1) {
      const wrap = confirm('Multiple root objects found. Wrap them under a single parent?');
      if (!wrap) return;
      const wrapper = new (await import('@certe/atmos-core')).GameObject('PrefabRoot');
      for (const r of roots) {
        r.setParent(wrapper);
        editorState.scene.updateRootStatus(r);
      }
      editorState.scene.add(wrapper);
    }
    const input = window.prompt('Prefab name:', 'my-prefab');
    if (!input) return;
    const name = input.trim().replace(/\.prefab\.json$/i, '');
    if (!name) return;
    try {
      const data = serializePrefab(editorState.scene);
      const json = JSON.stringify(data, null, 2);
      await pfs.writeFile(`prefabs/${name}.prefab.json`, json);
      showToast(`Saved ${name}.prefab.json`);
    } catch (err) {
      console.warn('[Editor] Failed to save prefab:', err);
    }
  }, [editorState, showToast]);

  const handleLoad = useCallback(async () => {
    const projectFs = editorState.projectFs;
    if (projectFs?.isOpen) {
      try {
        const files = await projectFs.listFiles('scenes');
        const scenes = files.filter((f: string) => f.endsWith('.scene.json'));
        if (scenes.length === 0) {
          console.warn('[Editor] No scenes found in project');
          return;
        }
        let scenePath: string;
        if (scenes.length === 1) {
          scenePath = scenes[0]!;
        } else {
          const names = scenes.map((f: string) => f.replace(/^scenes\//, '').replace(/\.scene\.json$/, ''));
          const choice = window.prompt(`Load scene:\n${names.join(', ')}`, names[0]!);
          if (!choice) return;
          const trimmed = choice.trim();
          scenePath = `scenes/${trimmed}.scene.json`;
        }
        const json = await projectFs.readTextFile(scenePath);
        const data = JSON.parse(json);
        const ctx = deserializeContext;
        const scene = deserializeScene(data, ctx);
        if (ctx?.onComplete) await ctx.onComplete();
        const name = scenePath.replace(/^scenes\//, '').replace(/\.scene\.json$/, '');
        editorState.sceneName = name;
        editorState.setScene(scene);
        if (data.postProcess && renderSystem) applyPostProcess(renderSystem as unknown as Record<string, unknown>, data.postProcess);
      } catch (err) {
        console.warn('[Editor] Failed to load scene from project:', err);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const data = JSON.parse(reader.result as string);
          const ctx = deserializeContext;
          const scene = deserializeScene(data, ctx);
          if (ctx?.onComplete) await ctx.onComplete();
          editorState.setScene(scene);
          if (data.postProcess && renderSystem) applyPostProcess(renderSystem as unknown as Record<string, unknown>, data.postProcess);
        };
        reader.readAsText(file);
      };
      input.click();
    }
  }, [editorState, deserializeContext]);

  const gizmoButtons: Array<{ mode: GizmoMode; label: string }> = [
    { mode: 'translate', label: 'Move' },
    { mode: 'rotate', label: 'Rotate' },
    { mode: 'scale', label: 'Scale' },
  ];

  const handleCameraPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = CAMERA_PRESETS.find((p) => p.name === e.target.value);
    if (preset && orbitCamera) {
      const camera = orbitCamera.camera;
      if (camera) {
        applyCameraPreset(orbitCamera, preset, camera);
      }
    }
    e.target.value = '';
  };

  // Show project gate if no project is open
  if (!editorState.projectFs?.isOpen) {
    return (
      <div style={shellStyle}>
        <ProjectGate projectFs={projectFs} onProjectOpened={onOpenProject} />
      </div>
    );
  }

  const materialManager = editorState.materialManager ?? undefined;

  return (
    <div style={shellStyle}>
      {/* ── Toolbar ── */}
      <div style={toolbarStyle} data-atmos-toolbar>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#888', marginRight: '8px', letterSpacing: '0.5px' }}>
          ATMOS
        </span>

        {/* Active scene name */}
        <span style={{ fontSize: '11px', color: '#6ab0d6', marginRight: '4px', fontWeight: 500 }}>
          {editorState.sceneName || 'Untitled'}
        </span>

        <div style={sepStyle} />

        {/* Scene controls */}
        <button
          style={editorState.paused ? btnAccent : btnActive}
          onMouseDown={(e) => { e.preventDefault(); editorState.togglePause(); }}
        >
          {editorState.paused ? '\u25B6 Play' : '\u23F8 Pause'}
        </button>

        <div style={groupStyle}>
          <button style={btnBase} onClick={() => editorState.setScene(new Scene())}>New</button>
          <button style={btnBase} onClick={handleSave}>Save</button>
          {editorState.projectFs?.isOpen && (
            <button style={btnBase} onClick={handleSaveAs}>Save As</button>
          )}
          <button style={btnBase} onClick={handleLoad}>Load</button>
          {editorState.projectFs?.isOpen && (
            <button style={btnBase} onClick={handleSaveAsPrefab}>Save Prefab</button>
          )}
        </div>

        <div style={sepStyle} />

        {/* Gizmo mode */}
        <span style={labelStyle}>Tool</span>
        <div style={groupStyle}>
          {gizmoButtons.map(({ mode, label }) => (
            <button
              key={mode}
              style={editorState.gizmoMode === mode ? btnActive : btnBase}
              onClick={() => editorState.setGizmoMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          style={editorState.snapEnabled ? btnActive : btnBase}
          onClick={() => { editorState.toggleSnap(); setTick((t) => t + 1); }}
        >
          Snap
        </button>

        <div style={sepStyle} />

        {/* View */}
        <span style={labelStyle}>View</span>
        <select style={selectBase} onChange={handleCameraPreset} defaultValue="">
          <option value="" disabled>Camera</option>
          {CAMERA_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        {primitiveFactory && (
          <>
            <div style={sepStyle} />
            <span style={labelStyle}>Create</span>
            <select
              style={selectBase}
              value=""
              onChange={(e) => {
                const type = e.target.value as PrimitiveType;
                if (!type) return;
                const name = type.charAt(0).toUpperCase() + type.slice(1);
                const go = primitiveFactory(type, name);
                editorState.scene.add(go);
                editorState.select(go);
              }}
            >
              <option value="" disabled>Add...</option>
              <option value="cube">Cube</option>
              <option value="sphere">Sphere</option>
              <option value="cylinder">Cylinder</option>
              <option value="plane">Plane</option>
              <option value="camera">Camera</option>
              <option value="directionalLight">Directional Light</option>
              <option value="pointLight">Point Light</option>
              <option value="spotLight">Spot Light</option>
            </select>
          </>
        )}

        <div style={{ flex: 1 }} />

        {editorState.settingsManager && (
          <button
            style={btnBase}
            onClick={() => setSettingsOpen(true)}
            title="Project Settings"
          >
            {'\u2699'}
          </button>
        )}
      </div>

      {/* ── Body: Hierarchy | Splitter | Viewport+Assets | Splitter | Inspector ── */}
      <div style={bodyStyle}>
        <HierarchyPanel
          editorState={editorState}
          primitiveFactory={primitiveFactory}
          onDropModel={onDropModel ? (path, parent) => onDropModel(path, parent) : undefined}
          onDropPrefab={onDropPrefab ? (path, parent) => onDropPrefab(path, parent) : undefined}
          onFocusObject={orbitCamera ? (obj) => {
            obj.transform.updateWorldMatrix();
            const wm = obj.transform.worldMatrix;
            const pos = new Float32Array([wm[12]!, wm[13]!, wm[14]!]);
            orbitCamera!.focusOn(pos);
          } : undefined}
          style={{ width: `${hierarchyWidth}px`, minWidth: `${hierarchyWidth}px` }}
        />
        <div
          onMouseDown={hierarchySplitter.onMouseDown}
          style={{ width: '5px', cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#3a3a3a'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div ref={viewportRef} style={viewportStyle}>
            {toast && (
              <div style={{
                position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                background: '#1a6a3a', color: '#e8e8e8', padding: '5px 14px',
                borderRadius: '4px', fontSize: '11px', fontFamily: 'inherit',
                zIndex: 100, pointerEvents: 'none', whiteSpace: 'nowrap',
              }}>{toast}</div>
            )}
          </div>
          {showAssetBrowser && (
            <>
              <div
                onMouseDown={assetSplitter.onMouseDown}
                style={{ height: '5px', cursor: 'row-resize', background: 'transparent', flexShrink: 0 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#3a3a3a'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              />
              <AssetBrowserPanel
                editorState={editorState}
                onAttachScript={onAttachScript}
                onLoadModel={onLoadModel}
                onLoadScene={onLoadScene}
                onLoadPrefab={onLoadPrefab}
                style={{ height: `${assetBrowserHeight}px`, minHeight: `${assetBrowserHeight}px` }}
              />
            </>
          )}
        </div>
        <div
          onMouseDown={inspectorSplitter.onMouseDown}
          style={{ width: '5px', cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#3a3a3a'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', width: `${inspectorWidth}px`, minWidth: `${inspectorWidth}px`, borderLeft: '1px solid #2a2a2a', overflow: 'hidden' }}>
          <InspectorPanel
            editorState={editorState}
            materialManager={materialManager}
            componentFactory={componentFactory}
            componentFilter={componentFilter}
            componentRemover={componentRemover}
            onDropModel={onDropModel ? (path, go) => onDropModel(path, go) : undefined}
          />
          {renderSystem && <PostProcessPanel renderSystem={renderSystem} editorState={editorState} />}
        </div>
      </div>

      {settingsOpen && editorState.settingsManager && (
        <SettingsPanel
          settingsManager={editorState.settingsManager}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
