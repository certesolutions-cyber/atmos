import { Component } from '@atmos/core';
import { Mat4 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import type { Mesh } from './mesh.js';
import type { PipelineResources } from './pipeline.js';
import type { Material } from './material.js';
import { writeMaterialUniforms, MATERIAL_UNIFORM_SIZE } from './material.js';
import type { BoundingSphere } from './bounds.js';
import { getWhiteFallbackTexture } from './texture.js';

/** Per-object uniform buffer: MVP(64) + model(64) + normalMatrix(64) = 192 bytes */
const OBJECT_UNIFORM_SIZE = 192;

export class MeshRenderer extends Component {
  mesh: Mesh | null = null;
  material: Material | null = null;
  meshSource = '';
  materialSource = 'Default';
  uniformBuffer: GPUBuffer | null = null;
  bindGroup: GPUBindGroup | null = null;
  materialBindGroup: GPUBindGroup | null = null;

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
    device: GPUDevice,
    pipelineResources: PipelineResources,
    mesh: Mesh,
    material?: Material,
  ): void {
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
    this.materialBindGroup = this._device.createBindGroup({
      layout: this._pipelineResources.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.material.uniformBuffer } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: tex.view },
        { binding: 3, resource: tex.sampler },
      ],
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
    this._device.queue.writeBuffer(this.uniformBuffer, 0, this._mvp);
    this._device.queue.writeBuffer(this.uniformBuffer, 64, model);
    this._device.queue.writeBuffer(this.uniformBuffer, 128, this._normalMat);

    // Rebuild bind group if material texture changed
    if (this.material && this.material.textureVersion !== this._lastTextureVersion) {
      this._lastTextureVersion = this.material.textureVersion;
      this.materialBindGroup = null;
    }

    // Write material uniforms if dirty
    if (this.material?.dirty && this.material.uniformBuffer) {
      writeMaterialUniforms(this._matData, this.material);
      this._device.queue.writeBuffer(this.material.uniformBuffer, 0, this._matData);
      this.material.dirty = false;
    }
  }

  draw(pass: GPURenderPassEncoder): void {
    if (!this.mesh || !this.bindGroup || !this._pipelineResources || !this.materialBindGroup) return;
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
  }
}
