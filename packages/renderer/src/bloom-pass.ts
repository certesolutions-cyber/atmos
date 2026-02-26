/**
 * Bloom post-processing pass.
 * Downsample chain: HDR → 1/2 → 1/4 → 1/8 → 1/16 (threshold on first pass).
 * Upsample chain: 1/16 → 1/8 → 1/4 → 1/2 → full (additive blend).
 * Output: full-res bloom texture.
 */

import { BLOOM_DOWNSAMPLE_SHADER, BLOOM_UPSAMPLE_SHADER } from './bloom-shader.js';
import { drawFullscreenTriangle } from './fullscreen-quad.js';

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';
const MIP_COUNT = 5;

export class BloomPass {
  threshold = 1.0;
  intensity = 0.5;
  radius = 0.5;

  private readonly _device: GPUDevice;
  private readonly _downPipeline: GPURenderPipeline;
  private readonly _upPipeline: GPURenderPipeline;
  private readonly _sampler: GPUSampler;
  private readonly _downBGL: GPUBindGroupLayout;
  private readonly _upBGL: GPUBindGroupLayout;
  private readonly _paramsBuffer: GPUBuffer;

  private readonly _paramsData = new Float32Array(4);

  private _mipTextures: GPUTexture[] = [];
  private _mipViews: GPUTextureView[] = [];
  private _width = 0;
  private _height = 0;

  constructor(device: GPUDevice) {
    this._device = device;

    this._sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
    });

    this._paramsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Bind group layouts (identical for both: texture + sampler + params)
    this._downBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this._upBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const downModule = device.createShaderModule({ code: BLOOM_DOWNSAMPLE_SHADER });
    const upModule = device.createShaderModule({ code: BLOOM_UPSAMPLE_SHADER });

    this._downPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._downBGL] }),
      vertex: { module: downModule, entryPoint: 'vs' },
      fragment: { module: downModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });

    this._upPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._upBGL] }),
      vertex: { module: upModule, entryPoint: 'vs' },
      fragment: {
        module: upModule,
        entryPoint: 'fs',
        targets: [{
          format: HDR_FORMAT,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private _ensureMips(w: number, h: number): void {
    if (this._width === w && this._height === h) return;
    this._width = w;
    this._height = h;

    for (const tex of this._mipTextures) tex.destroy();
    this._mipTextures = [];
    this._mipViews = [];

    let mw = Math.max(1, Math.floor(w / 2));
    let mh = Math.max(1, Math.floor(h / 2));
    for (let i = 0; i < MIP_COUNT; i++) {
      const tex = this._device.createTexture({
        size: { width: mw, height: mh },
        format: HDR_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._mipTextures.push(tex);
      this._mipViews.push(tex.createView());
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
    }
  }

  /** Execute bloom and return the bloom texture view to be composited with HDR scene. */
  execute(encoder: GPUCommandEncoder, hdrTexture: GPUTexture): GPUTextureView {
    const w = hdrTexture.width;
    const h = hdrTexture.height;
    this._ensureMips(w, h);

    const hdrView = hdrTexture.createView();

    // --- Downsample chain ---
    for (let i = 0; i < MIP_COUNT; i++) {
      const srcView = i === 0 ? hdrView : this._mipViews[i - 1]!;
      const isFirst = i === 0 ? 1.0 : 0.0;

      this._paramsData[0] = this.threshold;
      this._paramsData[1] = isFirst;
      this._paramsData[2] = 0;
      this._paramsData[3] = 0;
      this._device.queue.writeBuffer(this._paramsBuffer, 0, this._paramsData as GPUAllowSharedBufferSource);

      const bg = this._device.createBindGroup({
        layout: this._downBGL,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this._sampler },
          { binding: 2, resource: { buffer: this._paramsBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this._mipViews[i]!,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      });
      pass.setPipeline(this._downPipeline);
      pass.setBindGroup(0, bg);
      drawFullscreenTriangle(pass);
      pass.end();
    }

    // --- Upsample chain (additive blend) ---
    for (let i = MIP_COUNT - 2; i >= 0; i--) {
      const srcView = this._mipViews[i + 1]!;
      this._paramsData[0] = this.radius;
      this._paramsData[1] = 0;
      this._paramsData[2] = 0;
      this._paramsData[3] = 0;
      this._device.queue.writeBuffer(this._paramsBuffer, 0, this._paramsData as GPUAllowSharedBufferSource);

      const bg = this._device.createBindGroup({
        layout: this._upBGL,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this._sampler },
          { binding: 2, resource: { buffer: this._paramsBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this._mipViews[i]!,
          loadOp: 'load',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this._upPipeline);
      pass.setBindGroup(0, bg);
      drawFullscreenTriangle(pass);
      pass.end();
    }

    // Return the largest bloom mip (half-res)
    return this._mipViews[0]!;
  }

  destroy(): void {
    for (const tex of this._mipTextures) tex.destroy();
    this._paramsBuffer.destroy();
  }
}
