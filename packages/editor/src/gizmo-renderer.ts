import type { GameObject } from '@atmos/core';
import { Mat4, Vec3 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import { createUnlitPipeline } from '@atmos/renderer';
import type { UnlitPipelineResources } from '@atmos/renderer';
import type { GizmoMode, GizmoAxis } from './gizmo-state.js';
import {
  createTranslateGizmo,
  createRotateGizmo,
  createScaleGizmo,
} from './gizmo-meshes.js';
import type { GizmoGeometry } from './gizmo-meshes.js';

interface GizmoBuffers {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
}

const UNIFORM_SIZE = 64; // MVP mat4x4

export class GizmoRenderer {
  private readonly _device: GPUDevice;
  private readonly _pipelineRes: UnlitPipelineResources;
  private readonly _uniformBuffer: GPUBuffer;
  private readonly _bindGroup: GPUBindGroup;
  private readonly _mvp: Mat4Type = Mat4.create();
  private readonly _model: Mat4Type = Mat4.create();
  private readonly _scaleVec = Vec3.create();

  private readonly _meshes: Record<GizmoMode, GizmoBuffers>;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this._device = device;
    this._pipelineRes = createUnlitPipeline(device, format, {
      depthWrite: false,
      depthCompare: 'always',
    });

    this._uniformBuffer = device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bindGroup = device.createBindGroup({
      layout: this._pipelineRes.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
    });

    this._meshes = {
      translate: this._uploadGeometry(createTranslateGizmo()),
      rotate: this._uploadGeometry(createRotateGizmo()),
      scale: this._uploadGeometry(createScaleGizmo()),
    };
  }

  private _uploadGeometry(geo: GizmoGeometry): GizmoBuffers {
    const vertexBuffer = this._device.createBuffer({
      size: geo.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(vertexBuffer, 0, geo.vertices);

    const indexBuffer = this._device.createBuffer({
      size: geo.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(indexBuffer, 0, geo.indices);

    return { vertexBuffer, indexBuffer, indexCount: geo.indices.length };
  }

  render(
    pass: GPURenderPassEncoder,
    vp: Float32Array,
    target: GameObject,
    mode: GizmoMode,
    _activeAxis: GizmoAxis,
    cameraDistance: number,
  ): void {
    // Position gizmo at object's world position, scaled by camera distance
    const worldMat = target.transform.worldMatrix;
    const gizmoScale = cameraDistance * 0.15;
    Vec3.set(this._scaleVec, gizmoScale, gizmoScale, gizmoScale);

    // Build model matrix: translate to object position, scale uniformly
    Mat4.identity(this._model);
    this._model[12] = worldMat[12]!;
    this._model[13] = worldMat[13]!;
    this._model[14] = worldMat[14]!;
    this._model[0] = gizmoScale;
    this._model[5] = gizmoScale;
    this._model[10] = gizmoScale;

    // MVP = VP * model
    Mat4.multiply(this._mvp, vp, this._model);
    this._device.queue.writeBuffer(this._uniformBuffer, 0, this._mvp);

    const mesh = this._meshes[mode];
    pass.setPipeline(this._pipelineRes.pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.setVertexBuffer(0, mesh.vertexBuffer);
    pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
    pass.drawIndexed(mesh.indexCount);
  }

  destroy(): void {
    this._uniformBuffer.destroy();
    for (const mesh of Object.values(this._meshes)) {
      mesh.vertexBuffer.destroy();
      mesh.indexBuffer.destroy();
    }
  }
}
