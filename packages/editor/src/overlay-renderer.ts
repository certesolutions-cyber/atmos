import { GridRenderer, Camera } from '@certe/atmos-renderer';
import type { RenderSystem, MeshRenderer } from '@certe/atmos-renderer';
import { Vec3 } from '@certe/atmos-math';
import { GizmoRenderer } from './gizmo-renderer.js';
import { CameraFrustumRenderer } from './camera-frustum-renderer.js';
import { JointGizmoRenderer } from './joint-gizmo-renderer.js';
import { ColliderGizmoRenderer } from './collider-gizmo-renderer.js';
import { WireframeRenderer } from './wireframe-renderer.js';
import { computeSelectionCenter } from './selection-utils.js';
import type { GizmoState } from './gizmo-state.js';
import type { EditorState } from './editor-state.js';
import type { EditorPhysicsPlugin } from './bootstrap/types.js';

export class OverlayRenderer {
  private readonly _gridRenderer: GridRenderer;
  private readonly _gizmoRenderer: GizmoRenderer;
  private readonly _frustumRenderer: CameraFrustumRenderer;
  private readonly _jointGizmoRenderer: JointGizmoRenderer;
  private readonly _colliderGizmoRenderer: ColliderGizmoRenderer;
  private readonly _wireframeRenderer: WireframeRenderer;
  private readonly _editorState: EditorState;
  private readonly _gizmoState: GizmoState;
  private readonly _renderSystem: RenderSystem;
  private readonly _physics: EditorPhysicsPlugin | undefined;
  private readonly _selectionCenter = Vec3.create();
  private _removeCallback: (() => void) | null = null;
  private _removeWireframeListener: (() => void) | null = null;

  constructor(
    renderSystem: RenderSystem,
    editorState: EditorState,
    gizmoState: GizmoState,
    physics?: EditorPhysicsPlugin,
  ) {
    this._renderSystem = renderSystem;
    this._editorState = editorState;
    this._gizmoState = gizmoState;
    this._physics = physics;

    const device = renderSystem.device;
    const format = renderSystem.format;

    this._gridRenderer = new GridRenderer(device, format);
    this._gizmoRenderer = new GizmoRenderer(device, format);
    this._frustumRenderer = new CameraFrustumRenderer(device, format);
    this._jointGizmoRenderer = new JointGizmoRenderer(device, format);
    this._colliderGizmoRenderer = new ColliderGizmoRenderer(device, format);
    this._wireframeRenderer = new WireframeRenderer(device);

    this._removeCallback = renderSystem.addOverlayCallback(
      (pass, vp, eye) => this._render(pass, vp, eye),
    );

    this._wireframeRenderer.setEnabled(editorState.wireframeEnabled);
    this._removeWireframeListener = editorState.on('wireframeChanged', () => {
      this._wireframeRenderer.setEnabled(editorState.wireframeEnabled);
    });
  }

  private _render(
    pass: GPURenderPassEncoder,
    vp: Float32Array,
    eye: Float32Array,
  ): void {
    // Wireframe draws in both edit and play mode (debug tool)
    this._wireframeRenderer.render(pass, this._renderSystem.meshRenderers as MeshRenderer[]);

    // Skip other overlays in play mode
    if (!this._editorState.paused) return;

    // Grid first
    this._gridRenderer.render(pass, this._renderSystem.device, vp, eye);

    // Gizmo on selection
    const selection = this._editorState.selection;
    if (selection.size > 0) {
      computeSelectionCenter(selection, this._selectionCenter);
      const cameraDist = Vec3.distance(eye, this._selectionCenter);

      this._gizmoRenderer.render(
        pass,
        vp,
        this._selectionCenter,
        this._editorState.gizmoMode,
        this._gizmoState.activeAxis,
        cameraDist,
      );

      // Collider gizmos for all selected objects
      if (this._physics) {
        const allColliders: import('./bootstrap/types.js').ColliderGizmoData[] = [];
        for (const go of selection) {
          const colliderData = this._physics.getColliderGizmoData(go);
          if (colliderData) allColliders.push(...colliderData);
        }
        if (allColliders.length > 0) {
          this._colliderGizmoRenderer.render(pass, vp, allColliders);
        }
      }

      // Camera frustum + joint gizmos only for single selection
      if (selection.size === 1) {
        const selected = this._editorState.selected!;

        const cam = selected.getComponent(Camera);
        if (cam) {
          this._frustumRenderer.render(pass, vp, cam, this._renderSystem.aspect);
        }

        if (this._physics) {
          const jointData = this._physics.getJointGizmoData(selected);
          if (jointData) {
            this._jointGizmoRenderer.render(pass, vp, jointData);
          }
        }
      }
    }
  }

  destroy(): void {
    this._removeCallback?.();
    this._removeWireframeListener?.();
    this._gridRenderer.destroy();
    this._gizmoRenderer.destroy();
    this._frustumRenderer.destroy();
    this._jointGizmoRenderer.destroy();
    this._colliderGizmoRenderer.destroy();
    this._wireframeRenderer.destroy();
  }
}
