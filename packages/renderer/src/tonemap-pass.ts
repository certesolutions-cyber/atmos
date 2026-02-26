/**
 * Tonemapping post-process pass.
 * Reads HDR scene + bloom + SSAO textures. Applies:
 *   1. SSAO (multiply AO into scene)
 *   2. Exposure adjustment
 *   3. ACES filmic tonemapping
 *   4. Gamma correction
 *   5. Vignette
 * Outputs to the swapchain (rgba8unorm).
 */

import { FULLSCREEN_VERTEX_SHADER, drawFullscreenTriangle } from './fullscreen-quad.js';

const TONEMAP_SHADER = FULLSCREEN_VERTEX_SHADER + /* wgsl */`
@group(0) @binding(0) var hdrTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var aoTexture: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;
@group(0) @binding(4) var<uniform> params: vec4<f32>; // x=bloomIntensity, y=exposure, z=vignetteIntensity, w=vignetteRadius

// ACES filmic tonemapping (Narkowicz 2015 fit)
fn ACESFilmic(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3(0.0), vec3(1.0));
}

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let hdr = textureSample(hdrTexture, texSampler, uv).rgb;
  let bloom = textureSample(bloomTexture, texSampler, uv).rgb;
  let ao = textureSample(aoTexture, texSampler, uv).r;

  // Apply AO + bloom + exposure
  var color = hdr * ao + bloom * params.x;
  color = color * params.y;

  // Tonemap
  color = ACESFilmic(color);

  // Gamma correction (linear → sRGB)
  color = pow(color, vec3(1.0 / 2.2));

  // Vignette
  let vignetteIntensity = params.z;
  if (vignetteIntensity > 0.0) {
    let center = uv - vec2(0.5);
    let dist = length(center);
    let radius = params.w;
    let vignette = smoothstep(radius, radius - 0.35, dist);
    color = color * mix(1.0, vignette, vignetteIntensity);
  }

  return vec4(color, 1.0);
}
`;

export class TonemapPass {
  private readonly _device: GPUDevice;
  private readonly _pipeline: GPURenderPipeline;
  private readonly _bgl: GPUBindGroupLayout;
  private readonly _sampler: GPUSampler;
  private readonly _paramsBuffer: GPUBuffer;
  private readonly _paramsData = new Float32Array(4);

  constructor(device: GPUDevice, outputFormat: GPUTextureFormat) {
    this._device = device;

    this._sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
    });

    this._paramsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const module = device.createShaderModule({ code: TONEMAP_SHADER });
    this._pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._bgl] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: outputFormat }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  execute(
    encoder: GPUCommandEncoder,
    hdrView: GPUTextureView,
    bloomView: GPUTextureView,
    aoView: GPUTextureView,
    outputView: GPUTextureView,
    bloomIntensity: number,
    exposure: number,
    vignetteIntensity: number,
    vignetteRadius: number,
  ): void {
    this._paramsData[0] = bloomIntensity;
    this._paramsData[1] = exposure;
    this._paramsData[2] = vignetteIntensity;
    this._paramsData[3] = vignetteRadius;
    this._device.queue.writeBuffer(this._paramsBuffer, 0, this._paramsData as GPUAllowSharedBufferSource);

    const bg = this._device.createBindGroup({
      layout: this._bgl,
      entries: [
        { binding: 0, resource: hdrView },
        { binding: 1, resource: bloomView },
        { binding: 2, resource: aoView },
        { binding: 3, resource: this._sampler },
        { binding: 4, resource: { buffer: this._paramsBuffer } },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: outputView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, bg);
    drawFullscreenTriangle(pass);
    pass.end();
  }

  destroy(): void {
    this._paramsBuffer.destroy();
  }
}
