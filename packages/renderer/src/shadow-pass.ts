import type { Scene } from '@atmos/core';
import type { Mat4Type } from '@atmos/math';
import { SHADOW_VERTEX_SHADER } from './shadow-shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { MeshRenderer } from './mesh-renderer.js';

const DEFAULT_RESOLUTION = 2048;

export class DirectionalShadowPass {
  private readonly _device: GPUDevice;
  private readonly _pipeline: GPURenderPipeline;
  private readonly _lightVPBuffer: GPUBuffer;
  private readonly _lightVPBindGroup: GPUBindGroup;
  private readonly _depthTexture: GPUTexture;
  private readonly _sampler: GPUSampler;
  readonly shadowMapView: GPUTextureView;
  readonly resolution: number;

  get lightVPBuffer(): GPUBuffer {
    return this._lightVPBuffer;
  }

  get shadowSampler(): GPUSampler {
    return this._sampler;
  }

  constructor(
    device: GPUDevice,
    objectBindGroupLayout: GPUBindGroupLayout,
    resolution = DEFAULT_RESOLUTION,
  ) {
    this._device = device;
    this.resolution = resolution;

    // Light VP uniform buffer (64 bytes = mat4x4)
    this._lightVPBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Bind group layout for group 1 (lightVP only)
    const lightVPBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    this._lightVPBindGroup = device.createBindGroup({
      layout: lightVPBGL,
      entries: [
        { binding: 0, resource: { buffer: this._lightVPBuffer } },
      ],
    });

    // Shadow depth texture
    this._depthTexture = device.createTexture({
      size: [resolution, resolution],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowMapView = this._depthTexture.createView();

    // Comparison sampler (nearest: depth32float doesn't support linear without float32-filterable)
    this._sampler = device.createSampler({
      compare: 'less',
    });

    // Shadow render pipeline (depth-only, no fragment shader)
    const shaderModule = device.createShaderModule({ code: SHADOW_VERTEX_SHADER });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [objectBindGroupLayout, lightVPBGL],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
            ],
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
        depthBias: 2,
        depthBiasSlopeScale: 2.0,
      },
    });
  }

  execute(
    encoder: GPUCommandEncoder, scene: Scene, lightVP: Mat4Type,
    extraDraw?: (pass: GPURenderPassEncoder) => void,
  ): void {
    this._device.queue.writeBuffer(this._lightVPBuffer, 0, lightVP as Float32Array);

    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowMapView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this._pipeline);
    pass.setBindGroup(1, this._lightVPBindGroup);

    for (const obj of scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (mr && mr.enabled && mr.castShadow && mr.mesh && mr.bindGroup) {
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
    this._lightVPBuffer.destroy();
  }
}

/**
 * Wraps a pair of DirectionalShadowPass (cascade 0 near + cascade 1 far)
 * for a single directional light shadow slot.
 */
export class DirectionalShadowPassPair {
  private readonly _cascade0: DirectionalShadowPass;
  private readonly _cascade1: DirectionalShadowPass;

  constructor(device: GPUDevice, objectBGL: GPUBindGroupLayout, resolution: number) {
    this._cascade0 = new DirectionalShadowPass(device, objectBGL, resolution);
    this._cascade1 = new DirectionalShadowPass(device, objectBGL, resolution);
  }

  get cascade0View(): GPUTextureView { return this._cascade0.shadowMapView; }
  get cascade1View(): GPUTextureView { return this._cascade1.shadowMapView; }

  execute(
    encoder: GPUCommandEncoder, scene: Scene,
    vp0: Mat4Type, vp1: Mat4Type,
    extraDraw?: (pass: GPURenderPassEncoder) => void,
  ): void {
    this._cascade0.execute(encoder, scene, vp0, extraDraw);
    this._cascade1.execute(encoder, scene, vp1, extraDraw);
  }

  destroy(): void {
    this._cascade0.destroy();
    this._cascade1.destroy();
  }
}
