/**
 * Non-MSAA depth pre-pass for screen-space effects (SSAO).
 * Renders scene geometry to a depth32float texture using the camera VP matrix.
 * The resulting texture has TEXTURE_BINDING so it can be sampled in post-processing.
 */

import type { Scene } from '@certe/atmos-core';
import type { Mat4Type } from '@certe/atmos-math';
import { SHADOW_VERTEX_SHADER } from './shadow-shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { MeshRenderer } from './mesh-renderer.js';

export class DepthPrepass {
  private readonly _device: GPUDevice;
  private readonly _pipeline: GPURenderPipeline;
  private readonly _vpBuffer: GPUBuffer;
  private readonly _vpBindGroup: GPUBindGroup;
  private _depthTexture: GPUTexture;
  private _depthView: GPUTextureView;
  private _width = 0;
  private _height = 0;

  get depthView(): GPUTextureView { return this._depthView; }
  get vpBindGroup(): GPUBindGroup { return this._vpBindGroup; }

  constructor(device: GPUDevice, objectBindGroupLayout: GPUBindGroupLayout, w: number, h: number) {
    this._device = device;

    this._vpBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const vpBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    this._vpBindGroup = device.createBindGroup({
      layout: vpBGL,
      entries: [{ binding: 0, resource: { buffer: this._vpBuffer } }],
    });

    const shaderModule = device.createShaderModule({ code: SHADOW_VERTEX_SHADER });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [objectBindGroupLayout, vpBGL],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'main',
        buffers: [{
          arrayStride: VERTEX_STRIDE_BYTES,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
      },
    });

    this._depthTexture = this._createTexture(w, h);
    this._depthView = this._depthTexture.createView();
    this._width = w;
    this._height = h;
  }

  private _createTexture(w: number, h: number): GPUTexture {
    return this._device.createTexture({
      size: { width: w, height: h },
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  resize(w: number, h: number): void {
    if (this._width === w && this._height === h) return;
    this._depthTexture.destroy();
    this._depthTexture = this._createTexture(w, h);
    this._depthView = this._depthTexture.createView();
    this._width = w;
    this._height = h;
  }

  execute(
    encoder: GPUCommandEncoder, scene: Scene, cameraVP: Mat4Type,
    extraDraw?: (pass: GPURenderPassEncoder) => void,
  ): void {
    this.resize(this._width, this._height);
    this._device.queue.writeBuffer(this._vpBuffer, 0, cameraVP as GPUAllowSharedBufferSource);

    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this._depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this._pipeline);
    pass.setBindGroup(1, this._vpBindGroup);

    for (const obj of scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (mr && mr.enabled && mr.receiveSSAO && mr.mesh && mr.bindGroup && !mr.customPipelineResources?.shadowPipeline) {
        pass.setBindGroup(0, mr.bindGroup);
        pass.setVertexBuffer(0, mr.mesh.vertexBuffer);
        pass.setIndexBuffer(mr.mesh.indexBuffer, mr.mesh.indexFormat);
        pass.drawIndexed(mr.mesh.indexCount);
      }
    }

    extraDraw?.(pass);

    pass.end();
  }

  destroy(): void {
    this._depthTexture.destroy();
    this._vpBuffer.destroy();
  }
}
