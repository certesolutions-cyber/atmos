import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Scene, serializeScene, deserializeScene } from '@atmos/core';
import type { DeserializeContext, Component, GameObject } from '@atmos/core';
import type { EditorState } from '../editor-state.js';
import type { OrbitCamera } from '../orbit-camera.js';
import type { ProjectFileSystem } from '../project-fs.js';
import { CAMERA_PRESETS, applyCameraPreset } from '../camera-presets.js';
import { HierarchyPanel } from './hierarchy-panel.js';
import { InspectorPanel } from './inspector-panel.js';
import { AssetBrowserPanel } from './asset-browser-panel.js';
import { ProjectGate } from './project-gate.js';
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
  onDropModel?: (path: string, target: GameObject | null) => void;
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
`;

/* ── Component ──────────────────────────────────────── */

export function EditorShell({
  editorState, projectFs, onOpenProject, deserializeContext, componentFactory, componentFilter, componentRemover,
  primitiveFactory, orbitCamera, canvas,
  showAssetBrowser, onAttachScript, onLoadModel, onDropModel,
}: EditorShellProps) {
  const [, setTick] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

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

  // Move canvas into viewport slot on mount
  useEffect(() => {
    if (viewportRef.current && canvas) {
      Object.assign(canvas.style, canvasStyle);
      canvas.style.visibility = 'visible';
      canvas.style.position = 'static';
      viewportRef.current.appendChild(canvas);
    }
  }, [canvas]);

  useEffect(() => {
    const unsub1 = editorState.on('pauseChanged', () => setTick((t) => t + 1));
    const unsub2 = editorState.on('gizmoModeChanged', () => setTick((t) => t + 1));
    const unsub3 = editorState.on('projectChanged', () => setTick((t) => t + 1));
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [editorState]);

  const handleSave = useCallback(async () => {
    const projectFs = editorState.projectFs;
    const data = serializeScene(editorState.scene);
    const json = JSON.stringify(data, null, 2);
    if (projectFs?.isOpen) {
      await projectFs.writeFile('scenes/main.scene.json', json);
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

  const handleLoad = useCallback(async () => {
    const projectFs = editorState.projectFs;
    if (projectFs?.isOpen) {
      try {
        const json = await projectFs.readTextFile('scenes/main.scene.json');
        const data = JSON.parse(json);
        const scene = deserializeScene(data, deserializeContext);
        editorState.setScene(scene);
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
        reader.onload = () => {
          const data = JSON.parse(reader.result as string);
          const scene = deserializeScene(data, deserializeContext);
          editorState.setScene(scene);
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
      <div style={toolbarStyle}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#888', marginRight: '8px', letterSpacing: '0.5px' }}>
          ATMOS
        </span>

        {/* Scene controls */}
        <button
          style={editorState.paused ? btnAccent : btnActive}
          onClick={() => editorState.togglePause()}
        >
          {editorState.paused ? '\u25B6 Play' : '\u23F8 Pause'}
        </button>

        <div style={groupStyle}>
          <button style={btnBase} onClick={() => editorState.setScene(new Scene())}>New</button>
          <button style={btnBase} onClick={handleSave}>Save</button>
          <button style={btnBase} onClick={handleLoad}>Load</button>
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
            </select>
          </>
        )}
      </div>

      {/* ── Body: Hierarchy | Viewport+Assets | Inspector ── */}
      <div style={bodyStyle}>
        <HierarchyPanel
          editorState={editorState}
          primitiveFactory={primitiveFactory}
          onDropModel={onDropModel ? (path, parent) => onDropModel(path, parent) : undefined}
          onFocusObject={orbitCamera ? (obj) => {
            obj.transform.updateWorldMatrix();
            const wm = obj.transform.worldMatrix;
            const pos = new Float32Array([wm[12]!, wm[13]!, wm[14]!]);
            orbitCamera!.focusOn(pos);
          } : undefined}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div ref={viewportRef} style={viewportStyle} />
          {showAssetBrowser && (
            <AssetBrowserPanel
              editorState={editorState}
              onAttachScript={onAttachScript}
              onLoadModel={onLoadModel}
            />
          )}
        </div>
        <InspectorPanel
          editorState={editorState}
          materialManager={materialManager}
          componentFactory={componentFactory}
          componentFilter={componentFilter}
          componentRemover={componentRemover}
          onDropModel={onDropModel ? (path, go) => onDropModel(path, go) : undefined}
        />
      </div>
    </div>
  );
}
