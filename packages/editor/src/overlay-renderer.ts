import { GridRenderer, Camera } from '@atmos/renderer';
import type { RenderSystem } from '@atmos/renderer';
import { Vec3 } from '@atmos/math';
import { GizmoRenderer } from './gizmo-renderer.js';
import { CameraFrustumRenderer } from './camera-frustum-renderer.js';
import type { GizmoState } from './gizmo-state.js';
import type { EditorState } from './editor-state.js';

export class OverlayRenderer {
  private readonly _gridRenderer: GridRenderer;
  private readonly _gizmoRenderer: GizmoRenderer;
  private readonly _frustumRenderer: CameraFrustumRenderer;
  private readonly _editorState: EditorState;
  private readonly _gizmoState: GizmoState;
  private readonly _renderSystem: RenderSystem;
  private _removeCallback: (() => void) | null = null;

  constructor(
    renderSystem: RenderSystem,
    editorState: EditorState,
    gizmoState: GizmoState,
  ) {
    this._renderSystem = renderSystem;
    this._editorState = editorState;
    this._gizmoState = gizmoState;

    const device = renderSystem.device;
    const format = renderSystem.format;

    this._gridRenderer = new GridRenderer(device, format);
    this._gizmoRenderer = new GizmoRenderer(device, format);
    this._frustumRenderer = new CameraFrustumRenderer(device, format);

    this._removeCallback = renderSystem.addOverlayCallback(
      (pass, vp, eye) => this._render(pass, vp, eye),
    );
  }

  private _render(
    pass: GPURenderPassEncoder,
    vp: Float32Array,
    eye: Float32Array,
  ): void {
    // Grid first
    this._gridRenderer.render(pass, this._renderSystem.device, vp, eye);

    // Gizmo + frustum on selected object
    const selected = this._editorState.selected;
    if (selected) {
      const wm = selected.transform.worldMatrix;
      const cameraDist = Vec3.distance(eye, Vec3.fromValues(wm[12]!, wm[13]!, wm[14]!));

      this._gizmoRenderer.render(
        pass,
        vp,
        selected,
        this._editorState.gizmoMode,
        this._gizmoState.activeAxis,
        cameraDist,
      );

      // Camera frustum wireframe
      const cam = selected.getComponent(Camera);
      if (cam) {
        this._frustumRenderer.render(pass, vp, cam, this._renderSystem.aspect);
      }
    }
  }

  destroy(): void {
    this._removeCallback?.();
    this._gridRenderer.destroy();
    this._gizmoRenderer.destroy();
    this._frustumRenderer.destroy();
  }
}
