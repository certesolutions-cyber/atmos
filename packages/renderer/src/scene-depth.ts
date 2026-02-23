/**
 * Full-scene depth pass for GPU readback (screenToWorldPoint).
 * Renders ALL visible geometry (regular, skinned, terrain) to a non-MSAA
 * depth32float texture with COPY_SRC so individual pixels can be read back.
 * Separate from the SSAO DepthPrepass which only covers a subset of geometry.
 */

import type { Mat4Type } from '@atmos/math';
import { SHADOW_VERTEX_SHADER } from './shadow-shader.js';
import { SKINNED_SHADOW_VERTEX_SHADER } from './skinned-shadow-shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { SKINNED_VERTEX_STRIDE_BYTES } from './skinned-geometry.js';
import { TERRAIN_VERTEX_STRIDE_BYTES } from './terrain-pipeline.js';
import type { MeshRenderer } from './mesh-renderer.js';
import type { SkinnedMeshRenderer } from './skinned-mesh-renderer.js';
import type { TerrainMeshRenderer } from './terrain-mesh-renderer.js';

export class SceneDepthPass {
  private readonly _device: GPUDevice;
  private readonly _vpBuffer: GPUBuffer;
  private readonly _vpBindGroup: GPUBindGroup;
  private readonly _vpBGL: GPUBindGroupLayout;
  private readonly _objectBGL: GPUBindGroupLayout;
  private _depthTexture: GPUTexture;
  private _width = 0;
  private _height = 0;

  // Lazy pipelines
  private _regularPipeline: GPURenderPipeline | null = null;
  private _skinnedPipeline: GPURenderPipeline | null = null;
  private _skinnedBoneBGL: GPUBindGroupLayout | null = null;
  private _terrainPipeline: GPURenderPipeline | null = null;

  get depthTexture(): GPUTexture { return this._depthTexture; }
  get width(): number { return this._width; }
  get height(): number { return this._height; }

  constructor(device: GPUDevice, objectBGL: GPUBindGroupLayout, w: number, h: number) {
    this._device = device;
    this._objectBGL = objectBGL;

    this._vpBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._vpBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    this._vpBindGroup = device.createBindGroup({
      layout: this._vpBGL,
      entries: [{ binding: 0, resource: { buffer: this._vpBuffer } }],
    });

    this._depthTexture = this._createTexture(w, h);
    this._width = w;
    this._height = h;
  }

  private _createTexture(w: number, h: number): GPUTexture {
    return this._device.createTexture({
      size: { width: w, height: h },
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
  }

  resize(w: number, h: number): void {
    if (this._width === w && this._height === h) return;
    this._depthTexture.destroy();
    this._depthTexture = this._createTexture(w, h);
    this._width = w;
    this._height = h;
  }

  execute(
    encoder: GPUCommandEncoder,
    vpMatrix: Mat4Type,
    meshRenderers: readonly MeshRenderer[],
    skinnedRenderers: readonly SkinnedMeshRenderer[],
    terrainRenderers: readonly TerrainMeshRenderer[],
  ): void {
    this._device.queue.writeBuffer(this._vpBuffer, 0, vpMatrix as Float32Array);

    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this._depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // Regular meshes
    if (meshRenderers.length > 0) {
      if (!this._regularPipeline) this._regularPipeline = this._createRegularPipeline();
      pass.setPipeline(this._regularPipeline);
      pass.setBindGroup(1, this._vpBindGroup);
      for (const mr of meshRenderers) {
        if (!mr.mesh || !mr.bindGroup) continue;
        pass.setBindGroup(0, mr.bindGroup);
        pass.setVertexBuffer(0, mr.mesh.vertexBuffer);
        pass.setIndexBuffer(mr.mesh.indexBuffer, mr.mesh.indexFormat);
        pass.drawIndexed(mr.mesh.indexCount);
      }
    }

    // Skinned meshes
    if (skinnedRenderers.length > 0) {
      if (!this._skinnedPipeline) this._createSkinnedPipeline();
      pass.setPipeline(this._skinnedPipeline!);
      pass.setBindGroup(1, this._vpBindGroup);
      for (const smr of skinnedRenderers) {
        if (!smr.mesh || !smr.bindGroup || !smr.shadowBoneBindGroup) continue;
        pass.setBindGroup(0, smr.bindGroup);
        pass.setBindGroup(2, smr.shadowBoneBindGroup);
        pass.setVertexBuffer(0, smr.mesh.vertexBuffer);
        pass.setIndexBuffer(smr.mesh.indexBuffer, smr.mesh.indexFormat);
        pass.drawIndexed(smr.mesh.indexCount);
      }
    }

    // Terrain meshes
    if (terrainRenderers.length > 0) {
      if (!this._terrainPipeline) this._terrainPipeline = this._createTerrainPipeline();
      pass.setPipeline(this._terrainPipeline);
      pass.setBindGroup(1, this._vpBindGroup);
      for (const tmr of terrainRenderers) {
        if (!tmr.mesh || !tmr.bindGroup) continue;
        pass.setBindGroup(0, tmr.bindGroup);
        pass.setVertexBuffer(0, tmr.mesh.vertexBuffer);
        pass.setIndexBuffer(tmr.mesh.indexBuffer, tmr.mesh.indexFormat);
        pass.drawIndexed(tmr.mesh.indexCount);
      }
    }

    pass.end();
  }

  private _createRegularPipeline(): GPURenderPipeline {
    const mod = this._device.createShaderModule({ code: SHADOW_VERTEX_SHADER });
    const layout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._objectBGL, this._vpBGL],
    });
    return this._device.createRenderPipeline({
      layout,
      vertex: {
        module: mod, entryPoint: 'main',
        buffers: [{ arrayStride: VERTEX_STRIDE_BYTES, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth32float' },
    });
  }

  private _createSkinnedPipeline(): void {
    const mod = this._device.createShaderModule({ code: SKINNED_SHADOW_VERTEX_SHADER });
    this._skinnedBoneBGL = this._device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    const layout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._objectBGL, this._vpBGL, this._skinnedBoneBGL],
    });
    this._skinnedPipeline = this._device.createRenderPipeline({
      layout,
      vertex: {
        module: mod, entryPoint: 'main',
        buffers: [{
          arrayStride: SKINNED_VERTEX_STRIDE_BYTES,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 3, offset: 32, format: 'uint16x4' },
            { shaderLocation: 4, offset: 40, format: 'float32x4' },
          ],
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth32float' },
    });
  }

  private _createTerrainPipeline(): GPURenderPipeline {
    const mod = this._device.createShaderModule({ code: SHADOW_VERTEX_SHADER });
    const layout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._objectBGL, this._vpBGL],
    });
    return this._device.createRenderPipeline({
      layout,
      vertex: {
        module: mod, entryPoint: 'main',
        buffers: [{ arrayStride: TERRAIN_VERTEX_STRIDE_BYTES, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth32float' },
    });
  }

  destroy(): void {
    this._depthTexture.destroy();
    this._vpBuffer.destroy();
  }
}
