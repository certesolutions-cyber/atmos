import { Component } from '@certe/atmos-core';
import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
import type { Mesh } from './mesh.js';
import type { PipelineResources } from './pipeline.js';
import type { CustomPipelineResources } from './custom-pipeline.js';
import type { Material } from './material.js';
import { writeMaterialUniforms, MATERIAL_UNIFORM_SIZE } from './material.js';
import type { BoundingSphere } from './bounds.js';
import { getWhiteFallbackTexture, getFlatNormalFallback, getDefaultMetallicRoughnessFallback } from './texture.js';

/** Minimal context for MeshRenderer — satisfied by RenderSystem via duck typing. */
export interface MeshRendererContext {
  readonly device: GPUDevice;
  readonly pipelineResources: PipelineResources;
}

/** Per-object uniform buffer: MVP(64) + model(64) + normalMatrix(64) = 192 bytes */
const OBJECT_UNIFORM_SIZE = 192;

export class MeshRenderer extends Component {
  mesh: Mesh | null = null;
  material: Material | null = null;
  meshSource = '';
  materialSource = 'Default';
  castShadow = true;
  receiveSSAO = true;
  uniformBuffer: GPUBuffer | null = null;
  bindGroup: GPUBindGroup | null = null;
  materialBindGroup: GPUBindGroup | null = null;

  /** Custom pipeline resources (set by RenderSystem when shaderType === 'custom'). */
  customPipelineResources: CustomPipelineResources | null = null;
  /** Custom material bind group (group 1 for custom pipeline). */
  customMaterialBindGroup: GPUBindGroup | null = null;

  private _device: GPUDevice | null = null;
  private _pipelineResources: PipelineResources | null = null;

  // Pre-allocated scratch matrices
  private readonly _mvp: Mat4Type = Mat4.create();
  private readonly _invModel: Mat4Type = Mat4.create();
  private readonly _normalMat: Mat4Type = Mat4.create();

  // Scratch buffer for material uniforms
  private readonly _matData = new Float32Array(MATERIAL_UNIFORM_SIZE / 4);

  private _lastTextureVersion = -1;

  // Pre-allocated bounding sphere result (reused by worldBoundingSphere getter)
  private readonly _worldBoundsCenter = new Float32Array(3);
  private readonly _worldBounds: BoundingSphere = { center: this._worldBoundsCenter, radius: 0 };

  init(
    ctx: MeshRendererContext,
    mesh: Mesh,
    material?: Material,
  ): void {
    const { device, pipelineResources } = ctx;
    this._device = device;
    this._pipelineResources = pipelineResources;
    this.mesh = mesh;
    this.material = material ?? null;

    this.uniformBuffer = device.createBuffer({
      size: OBJECT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipelineResources.objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  /** Lazily initialise GPU buffers if mesh+material exist but init() was never called. */
  ensureGPU(ctx: MeshRendererContext): void {
    if (this._device || !this.mesh) return;
    const { device, pipelineResources } = ctx;
    this._device = device;
    this._pipelineResources = pipelineResources;
    this.uniformBuffer = device.createBuffer({
      size: OBJECT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: pipelineResources.objectBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  /** Create material bind group lazily, once the shared scene buffer is available */
  initMaterialBindGroup(sceneBuffer: GPUBuffer): void {
    if (!this._device || !this._pipelineResources || !this.material) return;
    if (this.materialBindGroup) return;

    // Create material uniform buffer if needed
    if (!this.material.uniformBuffer) {
      this.material.uniformBuffer = this._device.createBuffer({
        size: MATERIAL_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.material.dirty = true;
    }

    const tex = this.material.albedoTexture ?? getWhiteFallbackTexture(this._device);
    const nrm = this.material.normalTexture ?? getFlatNormalFallback(this._device);
    const mr = this.material.metallicRoughnessTexture ?? getDefaultMetallicRoughnessFallback(this._device);
    this.materialBindGroup = this._device.createBindGroup({
      layout: this._pipelineResources.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.material.uniformBuffer } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: tex.view },
        { binding: 3, resource: tex.sampler },
        { binding: 4, resource: nrm.view },
        { binding: 5, resource: nrm.sampler },
        { binding: 6, resource: mr.view },
        { binding: 7, resource: mr.sampler },
      ],
    });
  }

  /** Create custom material bind group lazily for custom shader pipeline. */
  initCustomMaterialBindGroup(sceneBuffer: GPUBuffer): void {
    if (!this._device || !this.customPipelineResources || !this.material) return;
    if (this.customMaterialBindGroup) return;

    const desc = this.customPipelineResources.descriptor;

    // Create custom uniform buffer if needed
    if (!this.material.customUniformBuffer) {
      this.material.customUniformBuffer = this._device.createBuffer({
        size: desc.uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.material.customDirty = true;
    }

    // Build bind group entries
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.material.customUniformBuffer } },
      { binding: 1, resource: { buffer: sceneBuffer } },
    ];

    const whiteTex = getWhiteFallbackTexture(this._device);
    for (const tex of desc.textures) {
      const handle = this.material.customTextures.get(tex.name) ?? whiteTex;
      entries.push({ binding: tex.bindingIndex, resource: handle.view });
      entries.push({ binding: tex.samplerBindingIndex, resource: handle.sampler });
    }

    this.customMaterialBindGroup = this._device.createBindGroup({
      layout: this.customPipelineResources.materialBindGroupLayout,
      entries,
    });
  }

  writeUniforms(viewProjection: Mat4Type): void {
    if (!this._device || !this.uniformBuffer) return;

    const model = this.gameObject.transform.worldMatrix;

    // MVP
    Mat4.multiply(this._mvp, viewProjection, model);

    // Normal matrix = transpose(inverse(model))
    Mat4.invert(this._invModel, model);
    Mat4.transpose(this._normalMat, this._invModel);

    // Write all 3 matrices to buffer
    this._device.queue.writeBuffer(this.uniformBuffer, 0, this._mvp as GPUAllowSharedBufferSource);
    this._device.queue.writeBuffer(this.uniformBuffer, 64, model as GPUAllowSharedBufferSource);
    this._device.queue.writeBuffer(this.uniformBuffer, 128, this._normalMat as GPUAllowSharedBufferSource);

    // Rebuild bind group if material texture changed
    if (this.material && this.material.textureVersion !== this._lastTextureVersion) {
      this._lastTextureVersion = this.material.textureVersion;
      this.materialBindGroup = null;
    }

    // Write material uniforms if dirty
    if (this.material?.dirty && this.material.uniformBuffer) {
      writeMaterialUniforms(this._matData, this.material);
      this._device.queue.writeBuffer(this.material.uniformBuffer, 0, this._matData as GPUAllowSharedBufferSource);
      this.material.dirty = false;
    }

    // Write custom uniform data if dirty
    if (this.material?.customDirty && this.material.customUniformBuffer && this.material.customUniformData) {
      this._device.queue.writeBuffer(
        this.material.customUniformBuffer, 0,
        this.material.customUniformData as GPUAllowSharedBufferSource,
      );
      this.material.customDirty = false;
    }
  }

  draw(pass: GPURenderPassEncoder, shadowBindGroup?: GPUBindGroup, depthBindGroup?: GPUBindGroup): void {
    if (!this.mesh || !this.bindGroup) return;

    // Custom pipeline path
    if (this.customPipelineResources && this.customMaterialBindGroup) {
      pass.setPipeline(this.customPipelineResources.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setBindGroup(1, this.customMaterialBindGroup);
      if (shadowBindGroup) pass.setBindGroup(2, shadowBindGroup);
      if (depthBindGroup) pass.setBindGroup(3, depthBindGroup);
      pass.setVertexBuffer(0, this.mesh.vertexBuffer);
      pass.setIndexBuffer(this.mesh.indexBuffer, this.mesh.indexFormat);
      pass.drawIndexed(this.mesh.indexCount);
      return;
    }

    // Standard PBR/unlit path
    if (!this._pipelineResources || !this.materialBindGroup) return;
    pass.setPipeline(this._pipelineResources.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, this.materialBindGroup);
    pass.setVertexBuffer(0, this.mesh.vertexBuffer);
    pass.setIndexBuffer(this.mesh.indexBuffer, this.mesh.indexFormat);
    pass.drawIndexed(this.mesh.indexCount);
  }

  get worldBoundingSphere(): BoundingSphere | null {
    const bounds = this.mesh?.bounds;
    if (!bounds) return null;

    const model = this.gameObject.transform.worldMatrix;
    // Transform center by world matrix
    const cx = bounds.center[0]!;
    const cy = bounds.center[1]!;
    const cz = bounds.center[2]!;
    this._worldBoundsCenter[0] = model[0]! * cx + model[4]! * cy + model[8]! * cz + model[12]!;
    this._worldBoundsCenter[1] = model[1]! * cx + model[5]! * cy + model[9]! * cz + model[13]!;
    this._worldBoundsCenter[2] = model[2]! * cx + model[6]! * cy + model[10]! * cz + model[14]!;

    // Approximate world radius: max column scale
    const sx = Math.sqrt(model[0]! * model[0]! + model[1]! * model[1]! + model[2]! * model[2]!);
    const sy = Math.sqrt(model[4]! * model[4]! + model[5]! * model[5]! + model[6]! * model[6]!);
    const sz = Math.sqrt(model[8]! * model[8]! + model[9]! * model[9]! + model[10]! * model[10]!);
    this._worldBounds.radius = bounds.radius * Math.max(sx, sy, sz);

    return this._worldBounds;
  }

  onDestroy(): void {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.materialBindGroup = null;
    this.customMaterialBindGroup = null;
    this.customPipelineResources = null;
    if (this.material?.customUniformBuffer) {
      this.material.customUniformBuffer.destroy();
      this.material.customUniformBuffer = null;
    }
  }

  /** Destroy owned GPU mesh buffers (vertex + index). */
  destroyMesh(): void {
    if (this.mesh) {
      this.mesh.vertexBuffer.destroy();
      this.mesh.indexBuffer.destroy();
      this.mesh = null;
    }
  }
}
