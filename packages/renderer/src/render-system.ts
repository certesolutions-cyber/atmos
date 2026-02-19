import type { Scene } from '@atmos/core';
import type { Renderer } from '@atmos/core';
import { Mat4, Vec3 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { GPUContext } from './webgpu-device.js';
import type { PipelineResources } from './pipeline.js';
import type { LightSettings } from './light.js';
import { writeSceneUniforms, SCENE_UNIFORM_SIZE } from './light.js';
import { MeshRenderer } from './mesh-renderer.js';
import type { Camera } from './camera.js';

export interface CameraSettings {
  eye: Float32Array;
  target: Float32Array;
  up: Float32Array;
  fovY: number;
  near: number;
  far: number;
}

export function createDefaultCamera(): CameraSettings {
  return {
    eye: Vec3.fromValues(0, 2, 5),
    target: Vec3.fromValues(0, 0, 0),
    up: Vec3.fromValues(0, 1, 0),
    fovY: Math.PI / 4,
    near: 0.1,
    far: 100,
  };
}

export type OverlayCallback = (
  pass: GPURenderPassEncoder,
  vp: Float32Array,
  eye: Float32Array,
) => void;

export class RenderSystem implements Renderer {
  private readonly _gpu: GPUContext;
  private readonly _pipelineResources: PipelineResources;
  private _scene: Scene;
  private readonly _camera: CameraSettings;
  private readonly _light: LightSettings;

  private readonly _viewMatrix: Mat4Type = Mat4.create();
  private readonly _projMatrix: Mat4Type = Mat4.create();
  private readonly _vpMatrix: Mat4Type = Mat4.create();

  private readonly _sceneBuffer: GPUBuffer;
  private readonly _sceneData = new Float32Array(SCENE_UNIFORM_SIZE / 4);

  private _encoder: GPUCommandEncoder | null = null;
  private _pass: GPURenderPassEncoder | null = null;

  private readonly _overlayCallbacks = new Set<OverlayCallback>();
  private _activeCamera: Camera | null = null;
  private readonly _eyeScratch = new Float32Array(3);

  constructor(
    gpu: GPUContext,
    pipelineResources: PipelineResources,
    scene: Scene,
    camera: CameraSettings,
    light: LightSettings,
  ) {
    this._gpu = gpu;
    this._pipelineResources = pipelineResources;
    this._scene = scene;
    this._camera = camera;
    this._light = light;

    this._sceneBuffer = gpu.device.createBuffer({
      size: SCENE_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  get device(): GPUDevice {
    return this._gpu.device;
  }

  get format(): GPUTextureFormat {
    return this._gpu.format;
  }

  get aspect(): number {
    return this._gpu.canvas.width / this._gpu.canvas.height;
  }

  get camera(): CameraSettings {
    return this._camera;
  }

  get viewProjectionMatrix(): Mat4Type {
    return this._vpMatrix;
  }

  get pipelineResources(): PipelineResources {
    return this._pipelineResources;
  }

  get activeCamera(): Camera | null {
    return this._activeCamera;
  }

  set activeCamera(cam: Camera | null) {
    this._activeCamera = cam;
  }

  set scene(s: Scene) {
    this._scene = s;
  }

  addOverlayCallback(fn: OverlayCallback): () => void {
    this._overlayCallbacks.add(fn);
    return () => {
      this._overlayCallbacks.delete(fn);
    };
  }

  beginFrame(): void {
    const { device, context, depthTexture } = this._gpu;
    const aspect = this._gpu.canvas.width / this._gpu.canvas.height;

    let vpMatrix: Mat4Type;
    let cameraEye: Float32Array;

    if (this._activeCamera && this._activeCamera.enabled) {
      // Game camera: derive matrices from Camera component's Transform
      this._activeCamera.updateViewMatrix();
      Mat4.perspective(this._projMatrix, this._activeCamera.fovY, aspect, this._activeCamera.near, this._activeCamera.far);
      Mat4.multiply(this._vpMatrix, this._projMatrix, this._activeCamera.viewMatrix);
      this._activeCamera.getWorldPosition(this._eyeScratch);
      vpMatrix = this._vpMatrix;
      cameraEye = this._eyeScratch;
    } else {
      // Editor/fallback camera: use CameraSettings (orbit camera writes here)
      Mat4.perspective(this._projMatrix, this._camera.fovY, aspect, this._camera.near, this._camera.far);
      Mat4.lookAt(this._viewMatrix, this._camera.eye, this._camera.target, this._camera.up);
      Mat4.multiply(this._vpMatrix, this._projMatrix, this._viewMatrix);
      vpMatrix = this._vpMatrix;
      cameraEye = this._camera.eye;
    }

    writeSceneUniforms(this._sceneData, this._light, cameraEye);
    device.queue.writeBuffer(this._sceneBuffer, 0, this._sceneData);

    this._encoder = device.createCommandEncoder();

    const textureView = context.getCurrentTexture().createView();
    this._pass = this._encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // Draw all MeshRenderers
    for (const obj of this._scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (mr && mr.enabled) {
        mr.initMaterialBindGroup(this._sceneBuffer);
        mr.writeUniforms(vpMatrix);
        mr.draw(this._pass);
      }
    }

    // Overlay callbacks (grid, gizmos, etc.)
    for (const cb of this._overlayCallbacks) {
      cb(this._pass, vpMatrix, cameraEye);
    }
  }

  endFrame(): void {
    if (!this._pass || !this._encoder) return;
    this._pass.end();
    this._gpu.device.queue.submit([this._encoder.finish()]);
    this._encoder = null;
    this._pass = null;
  }
}
