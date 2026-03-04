import type { Scene } from '@certe/atmos-core';
import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
import { SHADOW_VERTEX_SHADER } from './shadow-shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { MeshRenderer } from './mesh-renderer.js';

const DEFAULT_RESOLUTION = 1024;

/**
 * Single 2D perspective shadow map for spot lights.
 * Uses perspective projection matching the spot cone (FOV = outerAngle * 2).
 */
export class SpotShadowPass {
  private readonly _device: GPUDevice;
  private readonly _pipeline: GPURenderPipeline;
  private readonly _lightVPBuffer: GPUBuffer;
  private readonly _lightVPBindGroup: GPUBindGroup;
  private readonly _depthTexture: GPUTexture;
  private readonly _sampler: GPUSampler;
  readonly shadowMapView: GPUTextureView;
  readonly resolution: number;

  private readonly _view: Mat4Type = Mat4.create();
  private readonly _proj: Mat4Type = Mat4.create();
  private readonly _vp: Mat4Type = Mat4.create();
  private readonly _target = new Float32Array(3);
  private readonly _up = new Float32Array(3);

  get lightVPBuffer(): GPUBuffer { return this._lightVPBuffer; }
  get shadowSampler(): GPUSampler { return this._sampler; }

  constructor(
    device: GPUDevice,
    objectBindGroupLayout: GPUBindGroupLayout,
    resolution = DEFAULT_RESOLUTION,
  ) {
    this._device = device;
    this.resolution = resolution;

    this._lightVPBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

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

    this._depthTexture = device.createTexture({
      size: [resolution, resolution],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowMapView = this._depthTexture.createView();

    this._sampler = device.createSampler({ compare: 'less' });

    const shaderModule = device.createShaderModule({ code: SHADOW_VERTEX_SHADER });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [objectBindGroupLayout, lightVPBGL],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'main',
        buffers: [{
          arrayStride: VERTEX_STRIDE_BYTES,
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
        depthBias: 1,
        depthBiasSlopeScale: 1.0,
      },
    });
  }

  /**
   * Render shadow map from the spot light's perspective.
   * @param lightPos  World position of the spot light
   * @param lightDir  Normalized world direction of the spot light
   * @param outerAngle Half-angle in radians
   * @param range     Light range (used as far plane)
   */
  execute(
    encoder: GPUCommandEncoder, scene: Scene,
    lightPos: Float32Array, lightDir: Float32Array,
    outerAngle: number, range: number,
    extraDraw?: (pass: GPURenderPassEncoder) => void,
  ): void {
    // Perspective projection: FOV = outerAngle * 2, aspect 1:1
    const fov = outerAngle * 2;
    Mat4.perspective(this._proj, fov, 1.0, 0.5, range);

    // View matrix: lookAt from lightPos toward lightPos + lightDir
    this._target[0] = lightPos[0]! + lightDir[0]!;
    this._target[1] = lightPos[1]! + lightDir[1]!;
    this._target[2] = lightPos[2]! + lightDir[2]!;

    // Pick an up vector that isn't collinear with lightDir
    const absY = Math.abs(lightDir[1]!);
    this._up[0] = 0; this._up[1] = absY > 0.99 ? 0 : 1; this._up[2] = absY > 0.99 ? 1 : 0;

    Mat4.lookAt(this._view, lightPos, this._target, this._up);
    Mat4.multiply(this._vp, this._proj, this._view);

    this._device.queue.writeBuffer(this._lightVPBuffer, 0, this._vp as GPUAllowSharedBufferSource);

    // Collect casters within range
    const lx = lightPos[0]!, ly = lightPos[1]!, lz = lightPos[2]!;
    const casters: MeshRenderer[] = [];
    for (const obj of scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (!mr || !mr.enabled || !mr.castShadow || !mr.mesh || !mr.bindGroup || mr.customPipelineResources?.shadowPipeline) continue;
      const bs = mr.worldBoundingSphere;
      if (bs) {
        const dx = bs.center[0]! - lx;
        const dy = bs.center[1]! - ly;
        const dz = bs.center[2]! - lz;
        if (dx * dx + dy * dy + dz * dz > (range + bs.radius) * (range + bs.radius)) continue;
      }
      casters.push(mr);
    }

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

    for (const mr of casters) {
      pass.setBindGroup(0, mr.bindGroup!);
      pass.setVertexBuffer(0, mr.mesh!.vertexBuffer);
      pass.setIndexBuffer(mr.mesh!.indexBuffer, mr.mesh!.indexFormat);
      pass.drawIndexed(mr.mesh!.indexCount);
    }

    extraDraw?.(pass);

    pass.end();
  }

  /** Return the computed view-projection matrix (valid after execute). */
  getViewProjection(): Mat4Type { return this._vp; }

  destroy(): void {
    this._depthTexture.destroy();
    this._lightVPBuffer.destroy();
  }
}
