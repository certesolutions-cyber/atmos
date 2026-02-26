/**
 * SkinnedMeshRenderer: renders a mesh with GPU skinning.
 * Same pattern as MeshRenderer but adds a bone storage buffer (group 3).
 */

import { Component } from '@atmos/core';
import { Mat4 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { Mesh } from './mesh.js';
import type { SkinnedPipelineResources } from './skinned-pipeline.js';
import type { Material } from './material.js';
import { writeMaterialUniforms, MATERIAL_UNIFORM_SIZE } from './material.js';
import type { BoundingSphere } from './bounds.js';
import { getWhiteFallbackTexture, getFlatNormalFallback, getDefaultMetallicRoughnessFallback } from './texture.js';

/** Minimal context for SkinnedMeshRenderer — satisfied by RenderSystem via duck typing. */
export interface SkinnedRendererContext {
  readonly device: GPUDevice;
  readonly skinnedPipelineResources: SkinnedPipelineResources;
}

const OBJECT_UNIFORM_SIZE = 192;

export class SkinnedMeshRenderer extends Component {
  mesh: Mesh | null = null;
  material: Material | null = null;
  meshSource = '';
  materialSource = 'Default';
  castShadow = true;
  jointCount = 0;

  uniformBuffer: GPUBuffer | null = null;
  bindGroup: GPUBindGroup | null = null;
  materialBindGroup: GPUBindGroup | null = null;

  /** Storage buffer for bone matrices (jointCount * 64 bytes). */
  boneBuffer: GPUBuffer | null = null;
  /** Bind group for group 3 (bone matrices). */
  boneBindGroup: GPUBindGroup | null = null;
  /** Shadow bone bind group (group 2 in shadow pipeline). */
  shadowBoneBindGroup: GPUBindGroup | null = null;

  private _device: GPUDevice | null = null;
  private _pipelineResources: SkinnedPipelineResources | null = null;

  private readonly _mvp: Mat4Type = Mat4.create();
  private readonly _invModel: Mat4Type = Mat4.create();
  private readonly _normalMat: Mat4Type = Mat4.create();
  private readonly _matData = new Float32Array(MATERIAL_UNIFORM_SIZE / 4);
  private _lastTextureVersion = -1;

  private readonly _worldBoundsCenter = new Float32Array(3);
  private readonly _worldBounds: BoundingSphere = { center: this._worldBoundsCenter, radius: 0 };

  init(
    ctx: SkinnedRendererContext,
    mesh: Mesh,
    jointCount: number,
    material?: Material,
  ): void {
    const { device, skinnedPipelineResources: pipelineResources } = ctx;
    this._device = device;
    this._pipelineResources = pipelineResources;
    this.mesh = mesh;
    this.jointCount = jointCount;
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

    // Bone storage buffer
    const boneBufferSize = Math.max(jointCount, 1) * 64;
    this.boneBuffer = device.createBuffer({
      size: boneBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.boneBindGroup = device.createBindGroup({
      layout: pipelineResources.boneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.boneBuffer } },
      ],
    });

    this.shadowBoneBindGroup = device.createBindGroup({
      layout: pipelineResources.shadowBoneBGL,
      entries: [
        { binding: 0, resource: { buffer: this.boneBuffer } },
      ],
    });
  }

  initMaterialBindGroup(sceneBuffer: GPUBuffer): void {
    if (!this._device || !this._pipelineResources || !this.material) return;
    if (this.materialBindGroup) return;

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

  /**
   * Write bone matrices from the sibling AnimationMixer component.
   * Call this after AnimationMixer.onUpdate() has run.
   */
  writeBoneMatrices(boneMatrices: Float32Array): void {
    if (!this._device || !this.boneBuffer) return;
    this._device.queue.writeBuffer(this.boneBuffer, 0, boneMatrices as GPUAllowSharedBufferSource);
  }

  writeUniforms(viewProjection: Mat4Type): void {
    if (!this._device || !this.uniformBuffer) return;

    const model = this.gameObject.transform.worldMatrix;
    Mat4.multiply(this._mvp, viewProjection, model);
    Mat4.invert(this._invModel, model);
    Mat4.transpose(this._normalMat, this._invModel);

    this._device.queue.writeBuffer(this.uniformBuffer, 0, this._mvp as GPUAllowSharedBufferSource);
    this._device.queue.writeBuffer(this.uniformBuffer, 64, model as GPUAllowSharedBufferSource);
    this._device.queue.writeBuffer(this.uniformBuffer, 128, this._normalMat as GPUAllowSharedBufferSource);

    if (this.material && this.material.textureVersion !== this._lastTextureVersion) {
      this._lastTextureVersion = this.material.textureVersion;
      this.materialBindGroup = null;
    }

    if (this.material?.dirty && this.material.uniformBuffer) {
      writeMaterialUniforms(this._matData, this.material);
      this._device.queue.writeBuffer(this.material.uniformBuffer, 0, this._matData as GPUAllowSharedBufferSource);
      this.material.dirty = false;
    }
  }

  draw(pass: GPURenderPassEncoder, shadowBindGroup?: GPUBindGroup): void {
    if (!this.mesh || !this.bindGroup || !this._pipelineResources || !this.materialBindGroup || !this.boneBindGroup) return;
    pass.setPipeline(this._pipelineResources.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, this.materialBindGroup);
    if (shadowBindGroup) pass.setBindGroup(2, shadowBindGroup);
    pass.setBindGroup(3, this.boneBindGroup);
    pass.setVertexBuffer(0, this.mesh.vertexBuffer);
    pass.setIndexBuffer(this.mesh.indexBuffer, this.mesh.indexFormat);
    pass.drawIndexed(this.mesh.indexCount);
  }

  get worldBoundingSphere(): BoundingSphere | null {
    const bounds = this.mesh?.bounds;
    if (!bounds) return null;

    const model = this.gameObject.transform.worldMatrix;
    const cx = bounds.center[0]!;
    const cy = bounds.center[1]!;
    const cz = bounds.center[2]!;
    this._worldBoundsCenter[0] = model[0]! * cx + model[4]! * cy + model[8]! * cz + model[12]!;
    this._worldBoundsCenter[1] = model[1]! * cx + model[5]! * cy + model[9]! * cz + model[13]!;
    this._worldBoundsCenter[2] = model[2]! * cx + model[6]! * cy + model[10]! * cz + model[14]!;

    const sx = Math.sqrt(model[0]! * model[0]! + model[1]! * model[1]! + model[2]! * model[2]!);
    const sy = Math.sqrt(model[4]! * model[4]! + model[5]! * model[5]! + model[6]! * model[6]!);
    const sz = Math.sqrt(model[8]! * model[8]! + model[9]! * model[9]! + model[10]! * model[10]!);
    this._worldBounds.radius = bounds.radius * Math.max(sx, sy, sz);

    return this._worldBounds;
  }

  onDestroy(): void {
    this.uniformBuffer?.destroy();
    this.boneBuffer?.destroy();
    this.uniformBuffer = null;
    this.boneBuffer = null;
    this.bindGroup = null;
    this.materialBindGroup = null;
    this.boneBindGroup = null;
    this.shadowBoneBindGroup = null;
  }

  destroyMesh(): void {
    if (this.mesh) {
      this.mesh.vertexBuffer.destroy();
      this.mesh.indexBuffer.destroy();
      this.mesh = null;
    }
  }
}
