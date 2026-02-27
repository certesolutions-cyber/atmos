import type { Scene } from '@certe/atmos-core';
import type { Renderer } from '@certe/atmos-core';
import { Mat4, Vec3 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
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
import { ShadowManager } from './shadow-manager.js';
import { Camera } from './camera.js';
import { extractFrustumPlanes, isSphereInFrustum } from './frustum.js';
import type { FrustumPlanes } from './frustum.js';
import { BloomPass } from './bloom-pass.js';
import { TonemapPass } from './tonemap-pass.js';
import { DepthPrepass } from './depth-prepass.js';
import { SSAOPass } from './ssao-pass.js';
import { SceneDepthPass } from './scene-depth.js';
import { createCubeGeometry, createPlaneGeometry, createSphereGeometry, createCylinderGeometry, VERTEX_STRIDE_FLOATS } from './geometry.js';
import { createMesh } from './mesh.js';
import { createMaterial } from './material.js';
import type { Material } from './material.js';
import type { Mesh } from './mesh.js';

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

/** Pluggable material loader — returns a GPU-ready Material for a given asset path. */
export type MaterialLoader = (path: string) => Promise<Material>;

export class RenderSystem implements Renderer {
  /** The active RenderSystem, set automatically on construction. */
  static current: RenderSystem | null = null;

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

  // Shadow manager (owns all shadow passes and bind groups)
  private _shadowManager: ShadowManager | null = null;
  private readonly _lightView: Mat4Type = Mat4.create();
  private readonly _lightProj: Mat4Type = Mat4.create();
  private readonly _lightDirScratch = new Float32Array(3);

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

  // Primitive mesh cache (lazy-created on first meshSource resolve)
  private _primitiveMeshes: Map<string, Mesh> | null = null;
  // Material loader callback (set by editor or player)
  private _materialLoader: MaterialLoader | null = null;
  // Pending material loads (dedup)
  private readonly _pendingMaterials = new Map<string, Promise<Material>>();

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
    RenderSystem.current = this;
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

  /** Set the material loader used to auto-resolve materialSource strings. */
  setMaterialLoader(loader: MaterialLoader): void {
    this._materialLoader = loader;
  }

  /** Resolve a `primitive:*` meshSource to a cached GPU Mesh. */
  private _resolvePrimitiveMesh(source: string): Mesh | null {
    if (!source.startsWith('primitive:')) return null;
    const name = source.slice(10);
    if (!this._primitiveMeshes) {
      this._primitiveMeshes = new Map();
    }
    let mesh = this._primitiveMeshes.get(name);
    if (mesh) return mesh;

    const S = VERTEX_STRIDE_FLOATS;
    const device = this._gpu.device;
    switch (name) {
      case 'cube': { const g = createCubeGeometry(); mesh = createMesh(device, g.vertices, g.indices, S); mesh.bounds = g.bounds; break; }
      case 'sphere': { const g = createSphereGeometry(0.5, 24, 16); mesh = createMesh(device, g.vertices, g.indices, S); mesh.bounds = g.bounds; break; }
      case 'plane': { const g = createPlaneGeometry(20, 20); mesh = createMesh(device, g.vertices, g.indices, S); mesh.bounds = g.bounds; break; }
      case 'cylinder': { const g = createCylinderGeometry(0.5, 0.5, 1, 16); mesh = createMesh(device, g.vertices, g.indices, S); mesh.bounds = g.bounds; break; }
      default: return null;
    }
    this._primitiveMeshes.set(name, mesh);
    return mesh;
  }

  /** Auto-resolve meshSource and materialSource on a MeshRenderer. */
  private _autoResolveMeshRenderer(mr: MeshRenderer): void {
    // Resolve mesh from meshSource
    if (!mr.mesh && mr.meshSource) {
      const mesh = this._resolvePrimitiveMesh(mr.meshSource);
      if (mesh) {
        mr.mesh = mesh;
        mr.ensureGPU(this);
      }
    }
    // Resolve material from materialSource
    if (!mr.material && mr.materialSource && this._materialLoader) {
      const path = mr.materialSource;
      if (!this._pendingMaterials.has(path)) {
        const promise = this._materialLoader(path).then((mat) => {
          this._pendingMaterials.delete(path);
          return mat;
        });
        this._pendingMaterials.set(path, promise);
      }
      this._pendingMaterials.get(path)!.then((mat) => {
        if (!mr.material) {
          mr.material = mat;
          mr.materialBindGroup = null; // force rebuild
        }
      });
      // Give a temporary default material so it renders this frame
      if (!mr.material) {
        mr.material = createMaterial({ albedo: [0.7, 0.7, 0.7, 1], metallic: 0, roughness: 0.5 });
      }
    }
    // Fallback: no materialSource but no material either — use default
    if (!mr.material && mr.mesh) {
      mr.material = createMaterial({ albedo: [0.7, 0.7, 0.7, 1], metallic: 0, roughness: 0.5 });
    }
  }

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
    device.queue.writeBuffer(this._sceneBuffer, 0, this._sceneData as GPUAllowSharedBufferSource);

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
        if (!mr.mesh && mr.meshSource) this._autoResolveMeshRenderer(mr);
        mr.ensureGPU(this);
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

    // --- Shadow passes (via ShadowManager) ---
    if (!this._shadowManager) {
      this._shadowManager = new ShadowManager(
        device,
        this._pipelineResources.objectBindGroupLayout,
        this._pipelineResources.shadowBindGroupLayout,
      );
    }
    const extraShadowDraw = this._makeExtraShadowDraw();
    const computeCascadeVP = this._computeCascadeVP.bind(this);
    const { bindGroup: shadowBindGroup } = this._shadowManager.update(
      this._encoder, this._scene, cameraEye, sceneLights,
      extraShadowDraw, computeCascadeVP,
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
 * Uses duck-typing to avoid importing from @certe/atmos-animation (circular dep).
 */
function findBoneMatrices(obj: import('@certe/atmos-core').GameObject): Float32Array | null {
  for (const c of obj.getComponents()) {
    const bm = (c as unknown as { boneMatrices?: Float32Array | null }).boneMatrices;
    if (bm instanceof Float32Array) return bm;
  }
  return null;
}
