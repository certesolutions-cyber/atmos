import type { Scene } from '@atmos/core';
import { Mat4, Vec3 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import { POINT_SHADOW_SHADER } from './point-shadow-shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { MeshRenderer } from './mesh-renderer.js';

const DEFAULT_RESOLUTION = 512;
const NUM_FACES = 6;

/** Per-face buffer: mat4x4(64) + vec4(16) = 80 bytes */
const FACE_UNIFORM_SIZE = 80;

/**
 * Cube face camera directions.
 * Each entry: [dirX, dirY, dirZ, upX, upY, upZ]
 */
const CUBE_FACES: readonly [number, number, number, number, number, number][] = [
  [1, 0, 0, 0, -1, 0],   // +X
  [-1, 0, 0, 0, -1, 0],  // -X
  [0, 1, 0, 0, 0, 1],    // +Y
  [0, -1, 0, 0, 0, -1],  // -Y
  [0, 0, 1, 0, -1, 0],   // +Z
  [0, 0, -1, 0, -1, 0],  // -Z
];

export class PointShadowPass {
  private readonly _device: GPUDevice;
  private readonly _pipeline: GPURenderPipeline;
  private readonly _faceBuffers: GPUBuffer[] = [];
  private readonly _faceBindGroups: GPUBindGroup[] = [];
  private readonly _depthTexture: GPUTexture;
  private readonly _faceViews: GPUTextureView[] = [];
  private readonly _sampler: GPUSampler;
  readonly cubeMapView: GPUTextureView;
  readonly resolution: number;

  // Scratch matrices (reused each frame)
  private readonly _view: Mat4Type = Mat4.create();
  private readonly _proj: Mat4Type = Mat4.create();
  private readonly _vp: Mat4Type = Mat4.create();
  private readonly _eye = new Float32Array(3);
  private readonly _target = new Float32Array(3);
  private readonly _up = new Float32Array(3);
  private readonly _uniformData = new ArrayBuffer(FACE_UNIFORM_SIZE);

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

    // Cube depth texture (6 layers)
    this._depthTexture = device.createTexture({
      size: [resolution, resolution, NUM_FACES],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Per-face 2D views for render targets
    for (let i = 0; i < NUM_FACES; i++) {
      this._faceViews.push(
        this._depthTexture.createView({
          dimension: '2d',
          baseArrayLayer: i,
          arrayLayerCount: 1,
        }),
      );
    }

    // Cube view for shader sampling
    this.cubeMapView = this._depthTexture.createView({ dimension: 'cube' });

    // Comparison sampler
    this._sampler = device.createSampler({ compare: 'less' });

    // Bind group layout for group 1 (lightVP + lightPosAndFar)
    const shadowBGL = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // One uniform buffer + bind group per face (writeBuffer is enqueued before
    // the command buffer executes, so a single buffer would use only the last write)
    for (let i = 0; i < NUM_FACES; i++) {
      const buf = device.createBuffer({
        size: FACE_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._faceBuffers.push(buf);
      this._faceBindGroups.push(
        device.createBindGroup({
          layout: shadowBGL,
          entries: [{ binding: 0, resource: { buffer: buf } }],
        }),
      );
    }

    // Shadow render pipeline (vertex + fragment for linear depth)
    const shaderModule = device.createShaderModule({ code: POINT_SHADOW_SHADER });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [objectBindGroupLayout, shadowBGL],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'front',
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
    encoder: GPUCommandEncoder, scene: Scene, lightPos: Float32Array, range: number,
    extraDraw?: (pass: GPURenderPassEncoder) => void,
  ): void {
    const near = 0.1;
    Mat4.perspective(this._proj, Math.PI / 2, 1.0, near, range);
    // Flip Y: lookAt produces right-handed view but WebGPU cube map sampling
    // expects V=0 at top matching tc convention (e.g. face +X: tc=-ry).
    // Without this flip, all 6 faces are vertically inverted.
    this._proj[5] = -this._proj[5]!;

    const f32 = new Float32Array(this._uniformData);
    const lx = lightPos[0]!, ly = lightPos[1]!, lz = lightPos[2]!;

    // Collect shadow casters within range once (shared across all 6 faces)
    const casters: MeshRenderer[] = [];
    for (const obj of scene.getAllObjects()) {
      const mr = obj.getComponent(MeshRenderer);
      if (!mr || !mr.enabled || !mr.castShadow || !mr.mesh || !mr.bindGroup) continue;
      const bs = mr.worldBoundingSphere;
      if (bs) {
        const dx = bs.center[0]! - lx;
        const dy = bs.center[1]! - ly;
        const dz = bs.center[2]! - lz;
        if (dx * dx + dy * dy + dz * dz > (range + bs.radius) * (range + bs.radius)) continue;
      }
      casters.push(mr);
    }

    for (let face = 0; face < NUM_FACES; face++) {
      const dir = CUBE_FACES[face]!;

      Vec3.copy(this._eye, lightPos);
      this._target[0] = lx + dir[0];
      this._target[1] = ly + dir[1];
      this._target[2] = lz + dir[2];
      this._up[0] = dir[3];
      this._up[1] = dir[4];
      this._up[2] = dir[5];

      Mat4.lookAt(this._view, this._eye, this._target, this._up);
      Mat4.multiply(this._vp, this._proj, this._view);

      f32.set(this._vp as Float32Array, 0);
      f32[16] = lx;
      f32[17] = ly;
      f32[18] = lz;
      f32[19] = range;
      this._device.queue.writeBuffer(this._faceBuffers[face]!, 0, this._uniformData as GPUAllowSharedBufferSource);

      const pass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: {
          view: this._faceViews[face]!,
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });

      pass.setPipeline(this._pipeline);
      pass.setBindGroup(1, this._faceBindGroups[face]!);

      for (const mr of casters) {
        pass.setBindGroup(0, mr.bindGroup!);
        pass.setVertexBuffer(0, mr.mesh!.vertexBuffer);
        pass.setIndexBuffer(mr.mesh!.indexBuffer, mr.mesh!.indexFormat);
        pass.drawIndexed(mr.mesh!.indexCount);
      }

      extraDraw?.(pass);

      pass.end();
    }
  }

  destroy(): void {
    this._depthTexture.destroy();
    for (const buf of this._faceBuffers) buf.destroy();
  }
}
