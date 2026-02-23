import type { Scene } from '@atmos/core';
import type { Renderer } from '@atmos/core';
import { Mat4, Vec3 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { GPUContext } from './webgpu-device.js';
import type { PipelineResources } from './pipeline.js';
import type { LightSettings } from './light.js';
import { writeSceneUniforms, SCENE_UNIFORM_SIZE, collectSceneLights } from './light.js';
import type { FogSettings } from './light.js';
import { MeshRenderer } from './mesh-renderer.js';
import { SkinnedMeshRenderer } from './skinned-mesh-renderer.js';
import type { SkinnedPipelineResources } from './skinned-pipeline.js';
import { createSkinnedPBRPipeline } from './skinned-pipeline.js';
import { TerrainMeshRenderer } from './terrain-mesh-renderer.js';
import { TERRAIN_VERTEX_STRIDE_BYTES } from './terrain-pipeline.js';
import { SHADOW_VERTEX_SHADER } from './shadow-shader.js';
import { DirectionalLight } from './directional-light.js';
import { PointLight } from './point-light.js';
import { SpotLight } from './spot-light.js';
import { DirectionalShadowPass } from './shadow-pass.js';
import { PointShadowPass } from './point-shadow-pass.js';
import { SpotShadowPass } from './spot-shadow-pass.js';
import { SHADOW_UNIFORM_SIZE, createDummyShadowResources } from './shadow-uniforms.js';
import type { DummyShadowResources } from './shadow-uniforms.js';
import { Camera } from './camera.js';
import { extractFrustumPlanes, isSphereInFrustum } from './frustum.js';
import type { FrustumPlanes } from './frustum.js';
import { BloomPass } from './bloom-pass.js';
import { TonemapPass } from './tonemap-pass.js';
import { DepthPrepass } from './depth-prepass.js';
import { SSAOPass } from './ssao-pass.js';
import { SceneDepthPass } from './scene-depth.js';

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

  // Directional shadow mapping (2 cascades)
  private _shadowPass0: DirectionalShadowPass | null = null;
  private _shadowPass1: DirectionalShadowPass | null = null;
  private _dummyShadow: DummyShadowResources | null = null;
  private _shadowUniformBuffer: GPUBuffer | null = null;
  private _shadowBindGroup: GPUBindGroup | null = null;
  private readonly _lightView: Mat4Type = Mat4.create();
  private readonly _lightProj: Mat4Type = Mat4.create();
  private readonly _lightVP0: Mat4Type = Mat4.create();
  private readonly _lightVP1: Mat4Type = Mat4.create();
  private readonly _lightDirScratch = new Float32Array(3);
  private readonly _shadowUniformData = new ArrayBuffer(SHADOW_UNIFORM_SIZE);

  // Point light shadow mapping
  private _pointShadowPass: PointShadowPass | null = null;
  private readonly _pointLightPosScratch = new Float32Array(3);

  // Spot light shadow mapping
  private _spotShadowPass: SpotShadowPass | null = null;
  private readonly _spotLightPosScratch = new Float32Array(3);
  private readonly _spotLightDirScratch = new Float32Array(3);

  // Frustum culling
  private readonly _frustumPlanes: FrustumPlanes = new Float32Array(24);

  // Post-processing
  private _bloomPass: BloomPass | null = null;
  private _tonemapPass: TonemapPass | null = null;
  private _depthPrepass: DepthPrepass | null = null;
  private _ssaoPass: SSAOPass | null = null;
  private readonly _invProjMatrix: Mat4Type = Mat4.create();
  private readonly _invVPMatrix: Mat4Type = Mat4.create();
  private _sceneDepthPass: SceneDepthPass | null = null;
  private _pendingReadbacks: PendingReadback[] = [];
  private _activeReadbacks: ActiveReadback[] = [];
  private _meshRenderers: MeshRenderer[] = [];
  private _skinnedMeshRenderers: SkinnedMeshRenderer[] = [];
  private _skinnedPipelineResources: SkinnedPipelineResources | null = null;
  private _terrainRenderers: TerrainMeshRenderer[] = [];
  private _terrainShadowPipeline: GPURenderPipeline | null = null;

  bloomIntensity = 0.5;
  bloomThreshold = 1.0;
  bloomRadius = 0.5;
  ssaoEnabled = true;
  ssaoRadius = 0.5;
  ssaoBias = 0.025;
  ssaoIntensity = 1.5;
  exposure = 1.0;
  vignetteIntensity = 0.3;
  vignetteRadius = 0.75;
  fogEnabled = false;
  fogMode: 'linear' | 'exponential' = 'linear';
  fogDensity = 0.02;
  fogStart = 10;
  fogEnd = 100;
  fogColor = new Float32Array([0.7, 0.75, 0.8]);

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

  get device(): GPUDevice { return this._gpu.device; }
  get format(): GPUTextureFormat { return this._gpu.format; }
  get aspect(): number { return this._gpu.canvas.width / this._gpu.canvas.height; }
  get camera(): CameraSettings { return this._camera; }
  get viewProjectionMatrix(): Mat4Type { return this._vpMatrix; }
  get pipelineResources(): PipelineResources { return this._pipelineResources; }
  get activeCamera(): Camera | null { return this._activeCamera; }
  set activeCamera(cam: Camera | null) { this._activeCamera = cam; }
  set scene(s: Scene) { this._scene = s; }
  get meshRenderers(): readonly MeshRenderer[] { return this._meshRenderers; }

  /** Lazily create the skinned PBR pipeline resources. */
  get skinnedPipelineResources(): SkinnedPipelineResources {
    if (!this._skinnedPipelineResources) {
      this._skinnedPipelineResources = createSkinnedPBRPipeline(this._gpu.device, this._gpu.format);
    }
    return this._skinnedPipelineResources;
  }

  addOverlayCallback(fn: OverlayCallback): () => void {
    this._overlayCallbacks.add(fn);
    return () => { this._overlayCallbacks.delete(fn); };
  }

  beginFrame(): void {
    const { device, msaaTexture, hdrTexture, depthTexture } = this._gpu;
    const aspect = this._gpu.canvas.width / this._gpu.canvas.height;

    let vpMatrix: Mat4Type;
    let cameraEye: Float32Array;

    if (this._activeCamera && this._activeCamera.enabled) {
      this._activeCamera.updateViewMatrix();
      Mat4.perspective(this._projMatrix, this._activeCamera.fovY, aspect, this._activeCamera.near, this._activeCamera.far);
      Mat4.multiply(this._vpMatrix, this._projMatrix, this._activeCamera.viewMatrix);
      this._activeCamera.getWorldPosition(this._eyeScratch);
      vpMatrix = this._vpMatrix;
      cameraEye = this._eyeScratch;
    } else {
      Mat4.perspective(this._projMatrix, this._camera.fovY, aspect, this._camera.near, this._camera.far);
      Mat4.lookAt(this._viewMatrix, this._camera.eye, this._camera.target, this._camera.up);
      Mat4.multiply(this._vpMatrix, this._projMatrix, this._viewMatrix);
      vpMatrix = this._vpMatrix;
      cameraEye = this._camera.eye;
    }

    const sceneLights = collectSceneLights(this._scene);
    const fog: FogSettings = {
      enabled: this.fogEnabled,
      mode: this.fogMode,
      density: this.fogDensity,
      start: this.fogStart,
      end: this.fogEnd,
      color: this.fogColor,
    };
    writeSceneUniforms(this._sceneData, cameraEye, sceneLights, this._light, fog);
    device.queue.writeBuffer(this._sceneBuffer, 0, this._sceneData);

    // Frustum culling + MeshRenderer uniform writes
    extractFrustumPlanes(this._frustumPlanes, vpMatrix);
    this._meshRenderers.length = 0;
    this._skinnedMeshRenderers.length = 0;
    this._terrainRenderers.length = 0;
    const meshRenderers = this._meshRenderers;
    const skinnedRenderers = this._skinnedMeshRenderers;
    const terrainRenderers = this._terrainRenderers;
    for (const obj of this._scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (mr && mr.enabled) {
        const bs = mr.worldBoundingSphere;
        if (!bs || isSphereInFrustum(this._frustumPlanes, bs)) {
          mr.initMaterialBindGroup(this._sceneBuffer);
          mr.writeUniforms(vpMatrix);
          meshRenderers.push(mr);
        }
      }
      const smr = obj.getComponent(SkinnedMeshRenderer);
      if (smr && smr.enabled) {
        const bs = smr.worldBoundingSphere;
        if (!bs || isSphereInFrustum(this._frustumPlanes, bs)) {
          smr.initMaterialBindGroup(this._sceneBuffer);
          smr.writeUniforms(vpMatrix);
          // Upload bone matrices from sibling AnimationMixer (if present)
          const boneData = findBoneMatrices(obj);
          if (boneData) smr.writeBoneMatrices(boneData);
          skinnedRenderers.push(smr);
        }
      }
      const tmr = obj.getComponent(TerrainMeshRenderer);
      if (tmr && tmr.enabled) {
        const bs = tmr.worldBoundingSphere;
        if (!bs || isSphereInFrustum(this._frustumPlanes, bs)) {
          tmr.initMaterialBindGroup(this._sceneBuffer);
          tmr.writeUniforms(vpMatrix);
          terrainRenderers.push(tmr);
        }
      }
    }

    this._encoder = device.createCommandEncoder();

    // Ensure dummy shadow resources exist (needed when no shadow lights are active)
    if (!this._dummyShadow) {
      this._dummyShadow = createDummyShadowResources(
        device,
        this._pipelineResources.shadowBindGroupLayout,
      );
    }

    // --- Shadow passes ---
    const dirLight = this._findShadowLight(DirectionalLight);
    let dirShadowEnabled = false;
    if (dirLight) {
      const objBGL = this._pipelineResources.objectBindGroupLayout;
      if (!this._shadowPass0) {
        this._shadowPass0 = new DirectionalShadowPass(device, objBGL, dirLight.shadowResolution);
        this._shadowBindGroup = null;
      }
      if (!this._shadowPass1) {
        this._shadowPass1 = new DirectionalShadowPass(device, objBGL, dirLight.shadowResolution);
        this._shadowBindGroup = null;
      }
      this._computeCascadeVP(this._lightVP0, dirLight, cameraEye, dirLight.shadowSize, dirLight.shadowDistance);
      this._computeCascadeVP(this._lightVP1, dirLight, cameraEye, dirLight.shadowFarSize, dirLight.shadowFarDistance);
      const extraDraw0 = this._makeExtraShadowDraw();
      this._shadowPass0.execute(this._encoder, this._scene, this._lightVP0, extraDraw0);
      this._shadowPass1.execute(this._encoder, this._scene, this._lightVP1, extraDraw0);
      dirShadowEnabled = true;
    }
    const pointLight = this._findShadowLight(PointLight);
    let pointShadowEnabled = false;
    const pointPos = this._pointLightPosScratch;
    let pointFar = 10;
    if (pointLight) {
      if (!this._pointShadowPass) {
        this._pointShadowPass = new PointShadowPass(device, this._pipelineResources.objectBindGroupLayout, pointLight.shadowResolution);
        this._shadowBindGroup = null;
      }
      pointLight.getWorldPosition(pointPos);
      pointFar = pointLight.range;
      const ptExtraDraw = this._makeExtraShadowDraw();
      this._pointShadowPass.execute(this._encoder, this._scene, pointPos, pointFar, ptExtraDraw);
      pointShadowEnabled = true;
    }

    // Spot light shadow
    const spotLight = this._findShadowLight(SpotLight);
    let spotShadowEnabled = false;
    const spotPos = this._spotLightPosScratch;
    const spotDir = this._spotLightDirScratch;
    let spotFar = 10;
    let spotOuterAngle = Math.PI / 4;
    if (spotLight) {
      if (!this._spotShadowPass) {
        this._spotShadowPass = new SpotShadowPass(device, this._pipelineResources.objectBindGroupLayout, spotLight.shadowResolution);
        this._shadowBindGroup = null;
      }
      spotLight.getWorldPosition(spotPos);
      spotLight.getWorldDirection(spotDir);
      spotFar = spotLight.range;
      spotOuterAngle = spotLight.outerAngle;
      const spotExtraDraw = this._makeExtraShadowDraw();
      this._spotShadowPass.execute(this._encoder, this._scene, spotPos, spotDir, spotOuterAngle, spotFar, spotExtraDraw);
      spotShadowEnabled = true;
    }

    const shadowBindGroup = this._buildShadowBindGroup(
      dirLight, dirShadowEnabled, pointShadowEnabled, pointPos, pointFar,
      pointLight?.shadowIntensity ?? 1,
      spotShadowEnabled, spotPos, spotFar,
      spotLight?.shadowIntensity ?? 1,
    );

    // --- Depth pre-pass for SSAO ---
    const canvasW = this._gpu.canvas.width, canvasH = this._gpu.canvas.height;
    if (this.ssaoEnabled) {
      if (!this._depthPrepass) {
        this._depthPrepass = new DepthPrepass(device, this._pipelineResources.objectBindGroupLayout, canvasW, canvasH);
      }
      this._depthPrepass.resize(canvasW, canvasH);
      const depthExtraDraw = this._makeDepthPrepassExtraDraw();
      this._depthPrepass.execute(this._encoder, this._scene, vpMatrix, depthExtraDraw);
    }

    // --- On-demand scene depth pass for screenToWorldPoint readback ---
    if (this._pendingReadbacks.length > 0) {
      if (!this._sceneDepthPass) {
        this._sceneDepthPass = new SceneDepthPass(device, this._pipelineResources.objectBindGroupLayout, canvasW, canvasH);
      }
      this._sceneDepthPass.resize(canvasW, canvasH);
      this._sceneDepthPass.execute(this._encoder, vpMatrix, meshRenderers, skinnedRenderers, terrainRenderers);
      Mat4.invert(this._invVPMatrix, vpMatrix);

      // Encode pixel copies for all pending readbacks
      for (const req of this._pendingReadbacks) {
        const px = Math.round(req.x);
        const py = Math.round(req.y);
        if (px < 0 || px >= canvasW || py < 0 || py >= canvasH) {
          req.resolve(null);
          continue;
        }
        const staging = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        this._encoder.copyTextureToBuffer(
          { texture: this._sceneDepthPass.depthTexture, origin: { x: px, y: py } },
          { buffer: staging, bytesPerRow: 256 },
          { width: 1, height: 1 },
        );
        this._activeReadbacks.push({
          staging, px, py, nearClip: req.nearClip, resolve: req.resolve,
          invVP: new Float32Array(this._invVPMatrix as Float32Array),
          eyeX: cameraEye[0]!, eyeY: cameraEye[1]!, eyeZ: cameraEye[2]!,
          canvasW, canvasH,
        });
      }
      this._pendingReadbacks.length = 0;
    }

    // Wire up Camera static so scripts can call Camera.main.screenToWorldPoint()
    Camera._renderSystem = this;

    // Begin main render pass: MSAA → resolve to HDR texture
    const cc = (this._activeCamera ?? Camera.getMain(this._scene))?.clearColor;
    const clearR = cc ? cc[0]! : 0.05;
    const clearG = cc ? cc[1]! : 0.05;
    const clearB = cc ? cc[2]! : 0.1;
    const clearA = cc ? cc[3] ?? 1 : 1;
    this._pass = this._encoder.beginRenderPass({
      colorAttachments: [{
          view: msaaTexture.createView(),
          resolveTarget: hdrTexture.createView(),
          clearValue: { r: clearR, g: clearG, b: clearB, a: clearA },
          loadOp: 'clear',
          storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // Set shadow bind group once for all objects
    this._pass.setBindGroup(2, shadowBindGroup);

    // Draw all MeshRenderers
    for (const mr of meshRenderers) {
      mr.draw(this._pass);
    }

    // Draw skinned mesh renderers (pass shadow bind group since pipeline switch invalidates it)
    for (const smr of skinnedRenderers) {
      smr.draw(this._pass, shadowBindGroup);
    }

    // Draw terrain renderers (re-sets shadow bind group after pipeline switch)
    for (const tmr of terrainRenderers) {
      tmr.draw(this._pass);
      this._pass.setBindGroup(2, shadowBindGroup);
    }

    // Overlay callbacks (grid, gizmos, etc.)
    for (const cb of this._overlayCallbacks) {
      cb(this._pass, vpMatrix, cameraEye);
    }
  }

  private _makeExtraShadowDraw(): ((pass: GPURenderPassEncoder) => void) | undefined {
    const hasT = this._terrainRenderers.length > 0;
    const hasS = this._skinnedMeshRenderers.length > 0;
    if (!hasT && !hasS) return undefined;

    // Terrain shadow pipeline (lazy)
    let terrainPipeline: GPURenderPipeline | null = null;
    if (hasT) {
      if (!this._terrainShadowPipeline) {
        this._terrainShadowPipeline = this._createTerrainShadowPipeline();
      }
      terrainPipeline = this._terrainShadowPipeline;
    }

    // Skinned shadow pipeline (from skinned pipeline resources)
    const skinnedRes = hasS ? this.skinnedPipelineResources : null;
    const tRenderers = this._terrainRenderers;
    const sRenderers = this._skinnedMeshRenderers;

    return (pass: GPURenderPassEncoder) => {
      // Draw terrain shadows
      if (terrainPipeline) {
        pass.setPipeline(terrainPipeline);
        for (const tmr of tRenderers) {
          if (!tmr.castShadow || !tmr.mesh || !tmr.bindGroup) continue;
          pass.setBindGroup(0, tmr.bindGroup);
          pass.setVertexBuffer(0, tmr.mesh.vertexBuffer);
          pass.setIndexBuffer(tmr.mesh.indexBuffer, tmr.mesh.indexFormat);
          pass.drawIndexed(tmr.mesh.indexCount);
        }
      }
      // Draw skinned shadows
      if (skinnedRes) {
        pass.setPipeline(skinnedRes.shadowPipeline);
        for (const smr of sRenderers) {
          if (!smr.castShadow || !smr.mesh || !smr.bindGroup || !smr.shadowBoneBindGroup) continue;
          pass.setBindGroup(0, smr.bindGroup);
          pass.setBindGroup(2, smr.shadowBoneBindGroup);
          pass.setVertexBuffer(0, smr.mesh.vertexBuffer);
          pass.setIndexBuffer(smr.mesh.indexBuffer, smr.mesh.indexFormat);
          pass.drawIndexed(smr.mesh.indexCount);
        }
      }
    };
  }

  /** Like _makeExtraShadowDraw but filters by receiveSSAO flag (for depth prepass only). */
  private _makeDepthPrepassExtraDraw(): ((pass: GPURenderPassEncoder) => void) | undefined {
    const ssaoTerrain = this._terrainRenderers.filter(t => t.receiveSSAO);
    if (ssaoTerrain.length === 0) return undefined;
    if (!this._terrainShadowPipeline) {
      this._terrainShadowPipeline = this._createTerrainShadowPipeline();
    }
    const pipeline = this._terrainShadowPipeline;
    return (pass: GPURenderPassEncoder) => {
      pass.setPipeline(pipeline);
      for (const tmr of ssaoTerrain) {
        if (!tmr.mesh || !tmr.bindGroup) continue;
        pass.setBindGroup(0, tmr.bindGroup);
        pass.setVertexBuffer(0, tmr.mesh.vertexBuffer);
        pass.setIndexBuffer(tmr.mesh.indexBuffer, tmr.mesh.indexFormat);
        pass.drawIndexed(tmr.mesh.indexCount);
      }
    };
  }

  private _createTerrainShadowPipeline(): GPURenderPipeline {
    const { device } = this._gpu;
    const shaderModule = device.createShaderModule({ code: SHADOW_VERTEX_SHADER });
    const lightVPBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._pipelineResources.objectBindGroupLayout, lightVPBGL],
    });
    return device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'main',
        buffers: [{
          arrayStride: TERRAIN_VERTEX_STRIDE_BYTES,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
          ],
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
        depthBias: 2,
        depthBiasSlopeScale: 2.0,
      },
    });
  }

  private _findShadowLight<T>(ctor: new () => T): (T & { enabled: boolean; castShadows: boolean }) | null {
    for (const obj of this._scene.getAllObjects()) {
      const c = obj.getComponent(ctor as unknown as new () => import('@atmos/core').Component) as unknown as T & { enabled: boolean; castShadows: boolean } | null;
      if (c && c.enabled && c.castShadows) return c;
    }
    return null;
  }

  private _computeCascadeVP(
    out: Mat4Type, light: DirectionalLight, cameraCenter: Float32Array,
    size: number, distance: number,
  ): void {
    light.getWorldDirection(this._lightDirScratch);
    const [dx, dy, dz] = this._lightDirScratch;
    const half = distance * 0.5;
    const [cx, cy, cz] = [cameraCenter[0]!, cameraCenter[1]!, cameraCenter[2]!];
    const eye = Vec3.fromValues(cx - dx! * half, cy - dy! * half, cz - dz! * half);
    const up = Math.abs(dy!) > 0.99 ? Vec3.fromValues(0, 0, 1) : Vec3.fromValues(0, 1, 0);
    Mat4.lookAt(this._lightView, eye, Vec3.fromValues(cx, cy, cz), up);
    Mat4.ortho(this._lightProj, -size, size, -size, size, 0.1, distance);
    Mat4.multiply(out, this._lightProj, this._lightView);
  }

  private _buildShadowBindGroup(
    dirLight: DirectionalLight | null, dirEnabled: boolean,
    pointEnabled: boolean, pointPos: Float32Array, pointFar: number,
    pointShadowIntensity: number,
    spotEnabled: boolean, spotPos: Float32Array, spotFar: number,
    spotShadowIntensity: number,
  ): GPUBindGroup {
    const f32 = new Float32Array(this._shadowUniformData);
    const u32 = new Uint32Array(this._shadowUniformData);
    // Cascade 0 VP (float indices 0-15), Cascade 1 VP (float indices 16-31)
    if (dirEnabled) {
      f32.set(this._lightVP0 as Float32Array, 0);
      f32.set(this._lightVP1 as Float32Array, 16);
    } else { f32.fill(0, 0, 32); }
    // Offsets in float indices: 128/4=32, 132/4=33, etc.
    f32[32] = 0.002; u32[33] = dirEnabled ? 1 : 0;
    f32[34] = 0.007; u32[35] = pointEnabled ? 1 : 0;
    f32[36] = pointPos[0]!; f32[37] = pointPos[1]!; f32[38] = pointPos[2]!; f32[39] = pointFar;
    f32[40] = dirLight?.shadowIntensity ?? 1;
    f32[41] = pointShadowIntensity;
    f32[42] = dirLight ? dirLight.shadowSize * 0.9 : 20;  // cascade split
    f32[43] = dirLight ? dirLight.shadowSize * 0.3 : 5;   // blend width

    // Spot shadow VP (float indices 44-59) = bytes 176-239
    if (spotEnabled && this._spotShadowPass) {
      f32.set(this._spotShadowPass.getViewProjection() as Float32Array, 44);
    } else { f32.fill(0, 44, 60); }
    // spotLightPosAndFar (float indices 60-63) = bytes 240-255
    f32[60] = spotPos[0]!; f32[61] = spotPos[1]!; f32[62] = spotPos[2]!; f32[63] = spotFar;
    // spotShadowBias, spotShadowEnabled, spotShadowIntensity (float indices 64-67) = bytes 256-271
    f32[64] = 0.002; u32[65] = spotEnabled ? 1 : 0;
    f32[66] = spotShadowIntensity;
    f32[67] = 0; // pad

    if (!this._shadowUniformBuffer) {
      this._shadowUniformBuffer = this._gpu.device.createBuffer({
        size: SHADOW_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    this._gpu.device.queue.writeBuffer(this._shadowUniformBuffer, 0, this._shadowUniformData);

    if (!this._shadowBindGroup) {
      const d = this._dummyShadow!;
      this._shadowBindGroup = this._gpu.device.createBindGroup({
        layout: this._pipelineResources.shadowBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this._shadowUniformBuffer } },
          { binding: 1, resource: this._shadowPass0?.shadowMapView ?? d.textureView },
          { binding: 2, resource: this._shadowPass0?.shadowSampler ?? d.sampler },
          { binding: 3, resource: this._pointShadowPass?.cubeMapView ?? d.cubeTextureView },
          { binding: 4, resource: this._shadowPass1?.shadowMapView ?? d.textureView1 },
          { binding: 5, resource: this._spotShadowPass?.shadowMapView ?? d.spotTextureView },
        ],
      });
    }
    return this._shadowBindGroup;
  }

  /**
   * Queue a depth readback for the next frame. The returned promise resolves
   * after endFrame() submits the GPU commands and the staging buffer is mapped.
   * Returns null if the pixel is sky (depth >= 1.0) or closer than nearClip world units.
   */
  screenToWorldPoint(x: number, y: number, nearClip?: number): Promise<Float32Array | null> {
    return new Promise(resolve => {
      this._pendingReadbacks.push({ x, y, nearClip, resolve });
    });
  }

  endFrame(): void {
    if (!this._pass || !this._encoder) return;
    this._pass.end();

    const { device, hdrTexture, context } = this._gpu;

    if (!this._bloomPass) this._bloomPass = new BloomPass(device);
    if (!this._tonemapPass) this._tonemapPass = new TonemapPass(device, this._gpu.format);
    if (!this._ssaoPass) this._ssaoPass = new SSAOPass(device);

    this._ssaoPass.enabled = this.ssaoEnabled && !!this._depthPrepass;
    this._ssaoPass.radius = this.ssaoRadius;
    this._ssaoPass.bias = this.ssaoBias;
    this._ssaoPass.intensity = this.ssaoIntensity;
    Mat4.invert(this._invProjMatrix, this._projMatrix);
    const canvasW2 = this._gpu.canvas.width, canvasH2 = this._gpu.canvas.height;
    const aoView = this._ssaoPass.execute(
      this._encoder, this._depthPrepass?.depthView ?? null,
      this._projMatrix, this._invProjMatrix, canvasW2, canvasH2,
    );

    this._bloomPass.threshold = this.bloomThreshold;
    this._bloomPass.radius = this.bloomRadius;
    const bloomView = this._bloomPass.execute(this._encoder, hdrTexture);

    const swapchainView = context.getCurrentTexture().createView();
    this._tonemapPass.execute(
      this._encoder, hdrTexture.createView(), bloomView, aoView, swapchainView,
      this.bloomIntensity, this.exposure, this.vignetteIntensity, this.vignetteRadius,
    );

    device.queue.submit([this._encoder.finish()]);
    this._encoder = null;
    this._pass = null;

    // Resolve pending depth readbacks (fire-and-forget async)
    if (this._activeReadbacks.length > 0) {
      const readbacks = this._activeReadbacks.slice();
      this._activeReadbacks.length = 0;
      for (const rb of readbacks) {
        resolveReadback(rb);
      }
    }
  }
}

interface PendingReadback {
  x: number;
  y: number;
  nearClip?: number;
  resolve: (v: Float32Array | null) => void;
}

interface ActiveReadback {
  staging: GPUBuffer;
  px: number;
  py: number;
  nearClip?: number;
  invVP: Float32Array;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  canvasW: number;
  canvasH: number;
  resolve: (v: Float32Array | null) => void;
}

async function resolveReadback(rb: ActiveReadback): Promise<void> {
  try {
    await rb.staging.mapAsync(GPUMapMode.READ);
    const depthValue = new Float32Array(rb.staging.getMappedRange())[0]!;
    rb.staging.unmap();
    rb.staging.destroy();

    if (depthValue >= 1.0) { rb.resolve(null); return; }

    const ndcX = (rb.px / rb.canvasW) * 2 - 1;
    const ndcY = 1 - (rb.py / rb.canvasH) * 2;
    const ndcZ = depthValue;
    const inv = rb.invVP;
    const rx = inv[0]! * ndcX + inv[4]! * ndcY + inv[8]! * ndcZ + inv[12]!;
    const ry = inv[1]! * ndcX + inv[5]! * ndcY + inv[9]! * ndcZ + inv[13]!;
    const rz = inv[2]! * ndcX + inv[6]! * ndcY + inv[10]! * ndcZ + inv[14]!;
    const rw = inv[3]! * ndcX + inv[7]! * ndcY + inv[11]! * ndcZ + inv[15]!;
    const worldX = rx / rw;
    const worldY = ry / rw;
    const worldZ = rz / rw;

    if (rb.nearClip !== undefined) {
      const dx = worldX - rb.eyeX, dy = worldY - rb.eyeY, dz = worldZ - rb.eyeZ;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < rb.nearClip) { rb.resolve(null); return; }
    }

    rb.resolve(Vec3.fromValues(worldX, worldY, worldZ));
  } catch {
    rb.resolve(null);
  }
}

/**
 * Find bone matrices on a sibling component (AnimationMixer).
 * Uses duck-typing to avoid importing from @atmos/animation (circular dep).
 */
function findBoneMatrices(obj: import('@atmos/core').GameObject): Float32Array | null {
  for (const c of obj.getComponents()) {
    const bm = (c as unknown as { boneMatrices?: Float32Array | null }).boneMatrices;
    if (bm instanceof Float32Array) return bm;
  }
  return null;
}
