/**
 * ClipmapMeshRenderer: per-ring Component that holds GPU resources and draws.
 *
 * Each LOD ring has one of these. The parent ClipmapTerrain component manages
 * creation and per-frame uniform updates.
 */

import { Component } from '@certe/atmos-core';
import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
import type { Mesh } from '@certe/atmos-renderer';
import type { Material } from '@certe/atmos-renderer';
import type { GPUTextureHandle } from '@certe/atmos-renderer';
import { writeMaterialUniforms, MATERIAL_UNIFORM_SIZE, getWhiteFallbackTexture } from '@certe/atmos-renderer';
import type { ClipmapPipelineResources } from './clipmap-pipeline.js';
import { CLIPMAP_LEVEL_UNIFORM_SIZE, CLIPMAP_OBJECT_UNIFORM_SIZE } from './types.js';

/** Scratch matrices (module-level, zero-alloc). */
const _mvp: Mat4Type = Mat4.create();
const _matData = new Float32Array(MATERIAL_UNIFORM_SIZE / 4);

export class ClipmapMeshRenderer extends Component {
  mesh: Mesh | null = null;
  material: Material | null = null;
  castShadow = true;
  receiveSSAO = true;

  /** LOD level index (0 = finest). */
  level = 0;

  /** GPU resources. */
  objectBuffer: GPUBuffer | null = null;
  levelBuffer: GPUBuffer | null = null;
  bindGroup: GPUBindGroup | null = null;
  materialBindGroup: GPUBindGroup | null = null;
  shadowBindGroup: GPUBindGroup | null = null;

  private _device: GPUDevice | null = null;
  private _pipeline: ClipmapPipelineResources | null = null;
  private _levelData = new Float32Array(CLIPMAP_LEVEL_UNIFORM_SIZE / 4);

  init(
    device: GPUDevice,
    pipeline: ClipmapPipelineResources,
    mesh: Mesh,
    heightmapView: GPUTextureView,
  ): void {
    this._device = device;
    this._pipeline = pipeline;
    this.mesh = mesh;

    this.objectBuffer = device.createBuffer({
      size: CLIPMAP_OBJECT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.levelBuffer = device.createBuffer({
      size: CLIPMAP_LEVEL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipeline.objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.objectBuffer } },
        { binding: 1, resource: { buffer: this.levelBuffer } },
        { binding: 2, resource: heightmapView },
      ],
    });

    this.shadowBindGroup = device.createBindGroup({
      layout: pipeline.shadowObjectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.objectBuffer } },
        { binding: 1, resource: { buffer: this.levelBuffer } },
        { binding: 2, resource: heightmapView },
      ],
    });
  }

  initMaterialBindGroup(sceneBuffer: GPUBuffer): void {
    if (!this._device || !this._pipeline || !this.material) return;
    if (this.materialBindGroup) return;

    if (!this.material.uniformBuffer) {
      this.material.uniformBuffer = this._device.createBuffer({
        size: MATERIAL_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.material.dirty = true;
    }

    const fallback = getWhiteFallbackTexture(this._device);
    const albedo: GPUTextureHandle = this.material.albedoTexture ?? fallback;

    this.materialBindGroup = this._device.createBindGroup({
      layout: this._pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.material.uniformBuffer } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: albedo.view },
        { binding: 3, resource: albedo.sampler },
      ],
    });
  }

  /** Write per-level uniform data. */
  writeLevelUniforms(
    originX: number, originZ: number, scale: number,
    gridSize: number, texelSize: number, hmWorldSize: number,
  ): void {
    if (!this._device || !this.levelBuffer) return;
    const d = this._levelData;
    d[0] = originX;
    d[1] = originZ;
    d[2] = scale;
    d[3] = gridSize;
    d[4] = texelSize;
    d[5] = hmWorldSize;
    // d[6..7] = padding
    this._device.queue.writeBuffer(this.levelBuffer, 0, d as GPUAllowSharedBufferSource);
  }

  /** Write MVP + model uniforms. */
  writeObjectUniforms(viewProjection: Mat4Type): void {
    if (!this._device || !this.objectBuffer) return;

    const model = this.gameObject.transform.worldMatrix;
    Mat4.multiply(_mvp, viewProjection, model);

    this._device.queue.writeBuffer(this.objectBuffer, 0, _mvp as GPUAllowSharedBufferSource);
    this._device.queue.writeBuffer(this.objectBuffer, 64, model as GPUAllowSharedBufferSource);

    // Write material uniforms if dirty
    if (this.material?.dirty && this.material.uniformBuffer) {
      writeMaterialUniforms(_matData, this.material);
      this._device.queue.writeBuffer(this.material.uniformBuffer, 0, _matData as GPUAllowSharedBufferSource);
      this.material.dirty = false;
    }
  }

  draw(pass: GPURenderPassEncoder): void {
    if (!this.mesh || !this.bindGroup || !this._pipeline || !this.materialBindGroup) return;
    pass.setPipeline(this._pipeline.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, this.materialBindGroup);
    pass.setVertexBuffer(0, this.mesh.vertexBuffer);
    pass.setIndexBuffer(this.mesh.indexBuffer, this.mesh.indexFormat);
    pass.drawIndexed(this.mesh.indexCount);
  }

  onDestroy(): void {
    this.objectBuffer?.destroy();
    this.levelBuffer?.destroy();
    this.objectBuffer = null;
    this.levelBuffer = null;
    this.bindGroup = null;
    this.materialBindGroup = null;
    this.shadowBindGroup = null;
  }
}
