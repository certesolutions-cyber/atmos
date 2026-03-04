import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { Scene, DeserializeContext, Component } from '@certe/atmos-core';
import { Camera } from '@certe/atmos-renderer';
import type { CameraSettings, RenderSystem } from '@certe/atmos-renderer';
import { Vec3 } from '@certe/atmos-math';
import { EditorState } from './editor-state.js';
import { EditorShell } from './components/editor-shell.js';
import { OrbitCamera } from './orbit-camera.js';
import { ObjectPicker } from './object-picker.js';
import { GizmoState } from './gizmo-state.js';
import { OverlayRenderer } from './overlay-renderer.js';
import { computeSelectionCenter } from './selection-utils.js';
import type { GameObject } from '@certe/atmos-core';
import type { ScriptAsset, AssetEntry } from './asset-types.js';
import type { ProjectFileSystem } from './project-fs.js';
import type { EditorPhysicsPlugin } from './bootstrap/types.js';

export type PrimitiveType = 'cube' | 'sphere' | 'cylinder' | 'plane' | 'planeHd' | 'camera' | 'directionalLight' | 'pointLight' | 'spotLight';

const GIZMO_SCREEN_SCALE = 0.15;

/** Scratch vec3 for selection center (avoids per-frame alloc) */
const _center = Vec3.create();

function gizmoScaleFor(eye: Float32Array, center: Float32Array): number {
  return Vec3.distance(eye, center) * GIZMO_SCREEN_SCALE;
}

export interface MountEditorOptions {
  deserializeContext?: DeserializeContext;
  projectFs?: ProjectFileSystem;
  onOpenProject?: () => Promise<void>;
  canvas?: HTMLCanvasElement;
  camera?: CameraSettings;
  renderSystem?: RenderSystem;
  componentFactory?: (ctor: new () => Component, go: GameObject) => void;
  componentFilter?: (ctor: new () => Component, go: GameObject) => string | null;
  componentRemover?: (comp: Component, go: GameObject) => void;
  primitiveFactory?: (type: PrimitiveType, name: string) => GameObject;
  showAssetBrowser?: boolean;
  onAttachScript?: (script: ScriptAsset, go: GameObject) => void;
  onLoadModel?: (entry: AssetEntry) => void;
  onLoadScene?: (entry: AssetEntry) => void;
  onDropModel?: (path: string, target: GameObject | null) => void;
  onDropPrefab?: (path: string, parent: GameObject | null) => void;
  onLoadPrefab?: (entry: AssetEntry) => void;
  physics?: EditorPhysicsPlugin;
}

export interface MountEditorResult {
  editorState: EditorState;
  orbitCamera?: OrbitCamera;
  gizmoState?: GizmoState;
  unmount: () => void;
}

export function mountEditor(
  container: HTMLElement,
  scene: Scene,
  options?: MountEditorOptions,
): MountEditorResult {
  const editorState = new EditorState(scene);
  const root: Root = createRoot(container);
  const cleanups: Array<() => void> = [];

  let orbitCamera: OrbitCamera | undefined;
  let gizmoState: GizmoState | undefined;

  if (options?.canvas && options.camera) {
    orbitCamera = new OrbitCamera(options.camera);
    orbitCamera.attach(options.canvas, options.camera);
    cleanups.push(() => orbitCamera!.detach());
  }

  // Set up picking and gizmos if renderSystem is provided
  if (options?.renderSystem && options.canvas && options.camera) {
    const canvas = options.canvas;
    const camera = options.camera;
    const picker = new ObjectPicker();
    gizmoState = new GizmoState();

    // Overlay rendering (grid + gizmos)
    const overlay = new OverlayRenderer(options.renderSystem, editorState, gizmoState, options.physics);
    cleanups.push(() => overlay.destroy());

    // Canvas click -> pick object
    const onMouseDown = (e: MouseEvent) => {
      // In play mode: just ensure canvas has focus so keyboard events work
      if (!editorState.paused) {
        canvas.focus();
        return;
      }
      // Only LMB without modifiers (alt = orbit)
      if (e.button !== 0 || e.altKey) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const selection = editorState.selection;

      // First check gizmo hit when something is selected
      if (selection.size > 0 && gizmoState) {
        computeSelectionCenter(selection, _center);
        const gizmoScale = gizmoScaleFor(camera.eye, _center);

        const axis = gizmoState.hitTest(sx, sy, camera, canvas, _center, gizmoScale);
        if (axis) {
          gizmoState.beginDrag(axis, sx, sy, camera, canvas, [...selection], gizmoScale, _center);
          return;
        }
      }

      // Then try object picking
      const result = picker.pick(sx, sy, editorState.scene, camera, canvas);
      const hitObj = result?.gameObject ?? null;

      if (hitObj && (e.ctrlKey || e.metaKey)) {
        editorState.toggleSelect(hitObj);
      } else if (hitObj && e.shiftKey) {
        editorState.addToSelection([hitObj]);
      } else {
        editorState.select(hitObj);
      }
    };

    // Mouse move for gizmo drag
    const onMouseMove = (e: MouseEvent) => {
      if (!editorState.paused) return;
      if (!gizmoState?.dragging) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      gizmoState.updateDrag(sx, sy, camera, canvas);
      const sel = [...editorState.selection];
      options.physics?.syncTransformsForObjects?.(sel);
      options.physics?.syncJointsForObjects?.(sel);
      editorState.notifyInspectorChanged();
    };

    // Mouse up ends gizmo drag
    const onMouseUp = () => {
      gizmoState?.endDrag();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    cleanups.push(() => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    });

    // Sync gizmo state with editor state (initial + on change)
    gizmoState.snapEnabled = editorState.snapEnabled;
    gizmoState.snapSize = editorState.snapSize;
    gizmoState.mode = editorState.gizmoMode;

    const unsubMode = editorState.on('gizmoModeChanged', () => {
      gizmoState!.mode = editorState.gizmoMode;
    });
    const unsubSnap = editorState.on('snapChanged', () => {
      gizmoState!.snapEnabled = editorState.snapEnabled;
      gizmoState!.snapSize = editorState.snapSize;
    });
    // Play/pause: switch between game camera and editor orbit camera
    const unsubPause = editorState.on('pauseChanged', () => {
      if (!editorState.paused) {
        const mainCam = Camera.getMain(editorState.scene);
        if (mainCam) options.renderSystem!.activeCamera = mainCam;
      } else {
        options.renderSystem!.activeCamera = null;
      }
    });
    const unsubSceneCam = editorState.on('sceneChanged', () => {
      options.renderSystem!.activeCamera = null;
    });
    // Sync collider scales + fixed body positions when inspector changes a transform
    const unsubInspectorPhysics = editorState.on('inspectorChanged', () => {
      if (editorState.selection.size > 0 && options.physics) {
        options.physics.syncTransformsForObjects?.([...editorState.selection]);
      }
    });
    cleanups.push(unsubMode, unsubSnap, unsubPause, unsubSceneCam, unsubInspectorPhysics);
  }

  root.render(
    React.createElement(EditorShell, {
      editorState,
      projectFs: options?.projectFs!,
      onOpenProject: options?.onOpenProject ?? (async () => {}),
      deserializeContext: options?.deserializeContext,
      componentFactory: options?.componentFactory,
      componentFilter: options?.componentFilter,
      componentRemover: options?.componentRemover,
      primitiveFactory: options?.primitiveFactory,
      orbitCamera: orbitCamera ?? undefined,
      canvas: options?.canvas ?? undefined,
      showAssetBrowser: options?.showAssetBrowser ?? false,
      onAttachScript: options?.onAttachScript,
      onLoadModel: options?.onLoadModel,
      onLoadScene: options?.onLoadScene,
      onDropModel: options?.onDropModel,
      onDropPrefab: options?.onDropPrefab,
      onLoadPrefab: options?.onLoadPrefab,
      renderSystem: options?.renderSystem,
    }),
  );

  const unmount = () => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    root.unmount();
  };

  return { editorState, orbitCamera, gizmoState, unmount };
}
