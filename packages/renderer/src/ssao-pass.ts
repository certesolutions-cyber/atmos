/**
 * Screen-Space Ambient Occlusion pass.
 * 1. Compute noisy AO at half resolution from depth buffer
 * 2. Blur the result with a 4x4 box filter
 * Output: blurred AO texture view (r8unorm, half-res)
 */

import { SSAO_SHADER, SSAO_BLUR_SHADER, SSAO_KERNEL_SIZE } from './ssao-shader.js';
import { drawFullscreenTriangle } from './fullscreen-quad.js';
import type { Mat4Type } from '@certe/atmos-math';

const AO_FORMAT: GPUTextureFormat = 'r8unorm';

/** SSAO uniform layout: invProj(64) + proj(64) + radius(4) + bias(4) + intensity(4) + pad(4) + kernel(256) = 400 */
const PARAMS_SIZE = 400;

export class SSAOPass {
  radius = 0.5;
  bias = 0.025;
  intensity = 1.5;
  enabled = true;

  private readonly _device: GPUDevice;
  private readonly _ssaoPipeline: GPURenderPipeline;
  private readonly _blurPipeline: GPURenderPipeline;
  private readonly _ssaoBGL: GPUBindGroupLayout;
  private readonly _blurBGL: GPUBindGroupLayout;
  private readonly _paramsBuffer: GPUBuffer;
  private readonly _noiseTexture: GPUTextureHandle;
  private readonly _linearSampler: GPUSampler;
  private readonly _kernel: Float32Array;
  private readonly _paramsData: Float32Array;

  private _aoTexture: GPUTexture | null = null;
  private _aoView: GPUTextureView | null = null;
  private _blurTexture: GPUTexture | null = null;
  private _blurView: GPUTextureView | null = null;
  private _width = 0;
  private _height = 0;

  // Fallback 1x1 white AO (used when SSAO is disabled)
  private _whiteTexture: GPUTexture;
  private _whiteView: GPUTextureView;

  constructor(device: GPUDevice) {
    this._device = device;

    // Generate hemisphere kernel
    this._kernel = new Float32Array(SSAO_KERNEL_SIZE * 4);
    for (let i = 0; i < SSAO_KERNEL_SIZE; i++) {
      // Random point in hemisphere
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random(); // hemisphere: z >= 0
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      x /= len; y /= len; z /= len;
      // Accelerating distribution: more samples close to origin
      let scale = (i + 1) / SSAO_KERNEL_SIZE;
      scale = 0.1 + scale * scale * 0.9;
      this._kernel[i * 4] = x * scale;
      this._kernel[i * 4 + 1] = y * scale;
      this._kernel[i * 4 + 2] = z * scale;
      this._kernel[i * 4 + 3] = 0;
    }

    // 4x4 noise texture (random tangent-space rotations)
    const noiseData = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      noiseData[i * 4] = Math.floor((Math.cos(angle) * 0.5 + 0.5) * 255);
      noiseData[i * 4 + 1] = Math.floor((Math.sin(angle) * 0.5 + 0.5) * 255);
      noiseData[i * 4 + 2] = 0;
      noiseData[i * 4 + 3] = 255;
    }
    const noiseTex = device.createTexture({
      size: [4, 4],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: noiseTex }, noiseData as GPUAllowSharedBufferSource, { bytesPerRow: 16 }, [4, 4]);
    const noiseSampler = device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });
    this._noiseTexture = { texture: noiseTex, view: noiseTex.createView(), sampler: noiseSampler };

    this._linearSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    this._paramsData = new Float32Array(PARAMS_SIZE / 4);

    this._paramsBuffer = device.createBuffer({
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // SSAO bind group layout
    this._ssaoBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    // Blur bind group layout
    this._blurBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const ssaoModule = device.createShaderModule({ code: SSAO_SHADER });
    this._ssaoPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._ssaoBGL] }),
      vertex: { module: ssaoModule, entryPoint: 'vs' },
      fragment: { module: ssaoModule, entryPoint: 'fs', targets: [{ format: AO_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });

    const blurModule = device.createShaderModule({ code: SSAO_BLUR_SHADER });
    this._blurPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._blurBGL] }),
      vertex: { module: blurModule, entryPoint: 'vs' },
      fragment: { module: blurModule, entryPoint: 'fs', targets: [{ format: AO_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });

    // 1x1 white fallback
    this._whiteTexture = device.createTexture({
      size: [1, 1], format: AO_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: this._whiteTexture }, new Uint8Array([255]) as GPUAllowSharedBufferSource, { bytesPerRow: 1 }, [1, 1]);
    this._whiteView = this._whiteTexture.createView();
  }

  private _ensureTextures(w: number, h: number): void {
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    if (this._width === hw && this._height === hh) return;
    this._width = hw;
    this._height = hh;

    this._aoTexture?.destroy();
    this._blurTexture?.destroy();

    this._aoTexture = this._device.createTexture({
      size: { width: hw, height: hh }, format: AO_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._aoView = this._aoTexture.createView();

    this._blurTexture = this._device.createTexture({
      size: { width: hw, height: hh }, format: AO_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._blurView = this._blurTexture.createView();
  }

  /** Execute SSAO. Returns AO texture view (white if disabled or no depth). */
  execute(
    encoder: GPUCommandEncoder,
    depthView: GPUTextureView | null,
    projMatrix: Mat4Type,
    invProjMatrix: Mat4Type,
    screenW: number,
    screenH: number,
  ): GPUTextureView {
    if (!this.enabled || !depthView) return this._whiteView;

    this._ensureTextures(screenW, screenH);

    // Write params (reuse cached array to avoid per-frame allocation)
    const data = this._paramsData;
    data.set(invProjMatrix as Float32Array, 0);   // offset 0: invProj
    data.set(projMatrix as Float32Array, 16);      // offset 16: proj
    data[32] = this.radius;
    data[33] = this.bias;
    data[34] = this.intensity;
    data[35] = 0;
    data.set(this._kernel, 36);                    // offset 36: kernel[16]
    this._device.queue.writeBuffer(this._paramsBuffer, 0, data as GPUAllowSharedBufferSource);

    // SSAO pass
    const ssaoBG = this._device.createBindGroup({
      layout: this._ssaoBGL,
      entries: [
        { binding: 0, resource: depthView },
        { binding: 1, resource: this._noiseTexture.view },
        { binding: 2, resource: this._noiseTexture.sampler },
        { binding: 3, resource: { buffer: this._paramsBuffer } },
      ],
    });

    const ssaoPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this._aoView!,
        loadOp: 'clear', storeOp: 'store',
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
      }],
    });
    ssaoPass.setPipeline(this._ssaoPipeline);
    ssaoPass.setBindGroup(0, ssaoBG);
    drawFullscreenTriangle(ssaoPass);
    ssaoPass.end();

    // Blur pass
    const blurBG = this._device.createBindGroup({
      layout: this._blurBGL,
      entries: [
        { binding: 0, resource: this._aoView! },
        { binding: 1, resource: this._linearSampler },
      ],
    });

    const blurPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this._blurView!,
        loadOp: 'clear', storeOp: 'store',
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
      }],
    });
    blurPass.setPipeline(this._blurPipeline);
    blurPass.setBindGroup(0, blurBG);
    drawFullscreenTriangle(blurPass);
    blurPass.end();

    return this._blurView!;
  }

  destroy(): void {
    this._aoTexture?.destroy();
    this._blurTexture?.destroy();
    this._paramsBuffer.destroy();
    this._whiteTexture.destroy();
    this._noiseTexture.texture.destroy();
  }
}

interface GPUTextureHandle {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
}
