import { Component } from '@certe/atmos-core';
import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT } from '@certe/atmos-renderer';
import { ParticleEmitter } from './particle-emitter.js';
import {
  PARTICLE_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_CAMERA_BUFFER_SIZE,
  PARTICLE_STRIDE_BYTES,
} from './particle-shader.js';

/** Overlay draw callback — matches RenderSystem.addOverlayCallback signature. */
export type ParticleOverlayCallback = (
  pass: GPURenderPassEncoder,
  vp: Float32Array,
  eye: Float32Array,
) => void;

/** Minimal context for ParticleRenderer — satisfied by RenderSystem via duck typing. */
export interface ParticleRendererContext {
  readonly device: GPUDevice;
  readonly camera: {
    readonly eye: Float32Array;
    readonly target: Float32Array;
    readonly up: Float32Array;
  };
  addOverlayCallback(fn: ParticleOverlayCallback): () => void;
}

/**
 * ParticleRenderer component — GPU billboard drawing only.
 *
 * Reads simulation data from a sibling ParticleEmitter and draws
 * camera-facing quads via an overlay callback. Follows the same
 * duck-typed context pattern as MeshRenderer.
 */
export class ParticleRenderer extends Component {
  /** Additive (true) or alpha (false) blending. */
  additive = true;

  // GPU resources
  private _device: GPUDevice | null = null;
  private _ctx: ParticleRendererContext | null = null;
  private _pipeline: GPURenderPipeline | null = null;
  private _cameraBuffer: GPUBuffer | null = null;
  private _particleBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _bindGroupLayout: GPUBindGroupLayout | null = null;
  private _cameraData = new Float32Array(PARTICLE_CAMERA_BUFFER_SIZE / 4);
  private _removeOverlay: (() => void) | null = null;
  private _maxParticles = 0;

  // Scratch
  private readonly _viewMatrix: Mat4Type = Mat4.create();

  /** Initialize with a duck-typed render context (e.g. RenderSystem). */
  init(ctx: ParticleRendererContext): void {
    this._ctx = ctx;
    this._device = ctx.device;

    // Read max particles from sibling emitter
    const emitter = this.getComponent(ParticleEmitter);
    this._maxParticles = emitter?.maxParticles ?? 200;

    this._initGPU();
    this._removeOverlay = ctx.addOverlayCallback(this._draw);
  }

  onDestroy(): void {
    this._removeOverlay?.();
    this._removeOverlay = null;
    this._cameraBuffer?.destroy();
    this._particleBuffer?.destroy();
    this._cameraBuffer = null;
    this._particleBuffer = null;
    this._bindGroup = null;
    this._pipeline = null;
    this._device = null;
    this._ctx = null;
  }

  private _initGPU(): void {
    const device = this._device!;

    this._bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      code: PARTICLE_VERTEX_SHADER + PARTICLE_FRAGMENT_SHADER,
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{
          format: HDR_FORMAT,
          blend: this.additive ? {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          } : {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
      },
      multisample: { count: MSAA_SAMPLE_COUNT },
    });

    this._cameraBuffer = device.createBuffer({
      size: PARTICLE_CAMERA_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bufferSize = this._maxParticles * PARTICLE_STRIDE_BYTES;
    this._particleBuffer = device.createBuffer({
      size: Math.max(bufferSize, 48),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this._bindGroup = device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this._cameraBuffer } },
        { binding: 1, resource: { buffer: this._particleBuffer } },
      ],
    });
  }

  /** Overlay draw callback — bound arrow function for stable reference. */
  private _draw = (
    pass: GPURenderPassEncoder,
    vp: Float32Array,
    _eye: Float32Array,
  ): void => {
    if (!this._device || !this._pipeline || !this._bindGroup || !this._ctx) return;

    // Read simulation data from sibling emitter
    const emitter = this.getComponent(ParticleEmitter);
    const pool = emitter?.pool;
    if (!pool) return;

    const alive = pool.aliveCount;
    if (alive === 0) return;

    // Upload camera uniforms: viewProjection + cameraRight + cameraUp
    const cam = this._ctx.camera;
    Mat4.lookAt(this._viewMatrix, cam.eye, cam.target, cam.up);

    const v = this._viewMatrix;
    this._cameraData.set(vp, 0); // viewProjection mat4 (16 floats)
    // cameraRight (view matrix row 0)
    this._cameraData[16] = v[0]!;
    this._cameraData[17] = v[4]!;
    this._cameraData[18] = v[8]!;
    this._cameraData[19] = 0;
    // cameraUp (view matrix row 1)
    this._cameraData[20] = v[1]!;
    this._cameraData[21] = v[5]!;
    this._cameraData[22] = v[9]!;
    this._cameraData[23] = 0;

    this._device.queue.writeBuffer(
      this._cameraBuffer!, 0,
      this._cameraData as GPUAllowSharedBufferSource,
    );

    // Upload particle data
    this._device.queue.writeBuffer(
      this._particleBuffer!, 0,
      pool.gpuData.buffer, 0,
      alive * PARTICLE_STRIDE_BYTES,
    );

    // Draw instanced billboards
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.draw(6, alive);
  };
}
