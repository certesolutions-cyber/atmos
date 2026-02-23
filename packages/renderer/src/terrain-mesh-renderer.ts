/**
 * TerrainMeshRenderer: MeshRenderer variant for terrain splat-map rendering.
 *
 * Uses the terrain pipeline (40B vertex stride) and binds 3 splat textures
 * instead of the standard PBR albedo/normal/MR textures.
 */

import { Component } from '@atmos/core';
import { Mat4 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { Mesh } from './mesh.js';
import type { TerrainPipelineResources } from './terrain-pipeline.js';
import type { Material } from './material.js';
import { writeMaterialUniforms, MATERIAL_UNIFORM_SIZE } from './material.js';
import type { GPUTextureHandle } from './texture.js';
import { getWhiteFallbackTexture } from './texture.js';
import type { BoundingSphere } from './bounds.js';

const OBJECT_UNIFORM_SIZE = 192;

export class TerrainMeshRenderer extends Component {
  mesh: Mesh | null = null;
  material: Material | null = null;
  castShadow = true;
  receiveSSAO = false;
  splatTextures: [GPUTextureHandle, GPUTextureHandle, GPUTextureHandle] | null = null;

  uniformBuffer: GPUBuffer | null = null;
  bindGroup: GPUBindGroup | null = null;
  materialBindGroup: GPUBindGroup | null = null;

  private _device: GPUDevice | null = null;
  private _terrainPipeline: TerrainPipelineResources | null = null;

  private readonly _mvp: Mat4Type = Mat4.create();
  private readonly _invModel: Mat4Type = Mat4.create();
  private readonly _normalMat: Mat4Type = Mat4.create();
  private readonly _matData = new Float32Array(MATERIAL_UNIFORM_SIZE / 4);

  private readonly _worldBoundsCenter = new Float32Array(3);
  private readonly _worldBounds: BoundingSphere = { center: this._worldBoundsCenter, radius: 0 };

  init(
    device: GPUDevice,
    terrainPipeline: TerrainPipelineResources,
    mesh: Mesh,
    material?: Material,
    splatTextures?: [GPUTextureHandle, GPUTextureHandle, GPUTextureHandle],
  ): void {
    this._device = device;
    this._terrainPipeline = terrainPipeline;
    this.mesh = mesh;
    this.material = material ?? null;
    this.splatTextures = splatTextures ?? null;

    this.uniformBuffer = device.createBuffer({
      size: OBJECT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: terrainPipeline.objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  initMaterialBindGroup(sceneBuffer: GPUBuffer): void {
    if (!this._device || !this._terrainPipeline || !this.material) return;
    if (this.materialBindGroup) return;

    if (!this.material.uniformBuffer) {
      this.material.uniformBuffer = this._device.createBuffer({
        size: MATERIAL_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.material.dirty = true;
    }

    const fallback = getWhiteFallbackTexture(this._device);
    const t0 = this.splatTextures?.[0] ?? fallback;
    const t1 = this.splatTextures?.[1] ?? fallback;
    const t2 = this.splatTextures?.[2] ?? fallback;

    this.materialBindGroup = this._device.createBindGroup({
      layout: this._terrainPipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.material.uniformBuffer } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: t0.view },
        { binding: 3, resource: t1.view },
        { binding: 4, resource: t2.view },
        { binding: 5, resource: t0.sampler },
      ],
    });
  }

  writeUniforms(viewProjection: Mat4Type): void {
    if (!this._device || !this.uniformBuffer) return;

    const model = this.gameObject.transform.worldMatrix;
    Mat4.multiply(this._mvp, viewProjection, model);
    Mat4.invert(this._invModel, model);
    Mat4.transpose(this._normalMat, this._invModel);

    this._device.queue.writeBuffer(this.uniformBuffer, 0, this._mvp);
    this._device.queue.writeBuffer(this.uniformBuffer, 64, model);
    this._device.queue.writeBuffer(this.uniformBuffer, 128, this._normalMat);

    if (this.material?.dirty && this.material.uniformBuffer) {
      writeMaterialUniforms(this._matData, this.material);
      this._device.queue.writeBuffer(this.material.uniformBuffer, 0, this._matData);
      this.material.dirty = false;
    }
  }

  draw(pass: GPURenderPassEncoder): void {
    if (!this.mesh || !this.bindGroup || !this._terrainPipeline || !this.materialBindGroup) return;
    pass.setPipeline(this._terrainPipeline.pipeline);
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
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.materialBindGroup = null;
  }

  destroyMesh(): void {
    if (this.mesh) {
      this.mesh.vertexBuffer.destroy();
      this.mesh.indexBuffer.destroy();
      this.mesh = null;
    }
  }
}
