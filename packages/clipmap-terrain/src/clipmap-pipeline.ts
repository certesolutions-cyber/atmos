/**
 * Clipmap terrain GPU pipeline: main pass + shadow pass.
 *
 * Bind group layout:
 *   Group 0: object UBO(0) + level UBO(1) + heightmap texture(2)
 *   Group 1: material(0) + scene(1) + sampler(2) + splatmap(3) + splatUBO(4)
 *            + albedoArray(5) + normalArray(6)
 *   Group 2: shadow uniforms (standard shadow bind group layout)
 *
 * Layer textures are packed into texture_2d_array (4 layers each) to stay
 * within the 16 sampled textures per stage WebGPU limit.
 * Fragment textures: splatmap(1) + albedoArray(1) + normalArray(1) + 10 shadow = 13.
 *
 * Shadow pipeline layout:
 *   Group 0: same as main (object + level + heightmap)
 *   Group 1: lightVP UBO
 */

import {
  CLIPMAP_FRAGMENT_SHADER,
  CLIPMAP_VERTEX_SHADER,
  CLIPMAP_SHADOW_VERTEX_SHADER,
  CLIPMAP_SSAO_ERASE_SHADER,
} from './clipmap-shader.js';
import { CLIPMAP_VERTEX_STRIDE_BYTES } from './types.js';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT, createShadowBindGroupLayout } from '@certe/atmos-renderer';

export interface ClipmapPipelineResources {
  pipeline: GPURenderPipeline;
  objectBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  shadowBindGroupLayout: GPUBindGroupLayout;
  shadowPipeline: GPURenderPipeline;
  shadowObjectBindGroupLayout: GPUBindGroupLayout;
  shadowLightVPBindGroupLayout: GPUBindGroupLayout;
  /** Pipeline that writes 1.0 to r16float AO texture (erases SSAO for terrain pixels). */
  ssaoErasePipeline: GPURenderPipeline;
}

export function createClipmapPipeline(device: GPUDevice): ClipmapPipelineResources {
  // Group 0: per-ring (object + level + heightmap) — no sampler, bilinear done manually
  const objectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float', viewDimension: '2d' } },
    ],
  });

  // Group 1: material + scene + sampler + splatmap + splatUBO + albedoArray + normalArray
  const frag = GPUShaderStage.FRAGMENT;
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: frag, buffer: { type: 'uniform' } },   // material UBO
      { binding: 1, visibility: frag, buffer: { type: 'uniform' } },   // scene UBO
      { binding: 2, visibility: frag, sampler: { type: 'filtering' } }, // shared sampler
      { binding: 3, visibility: frag, texture: { sampleType: 'float' } },  // splatmap (2d)
      { binding: 4, visibility: frag, buffer: { type: 'uniform' } },   // splatmap UBO
      { binding: 5, visibility: frag, texture: { sampleType: 'float', viewDimension: '2d-array' } }, // albedo array
      { binding: 6, visibility: frag, texture: { sampleType: 'float', viewDimension: '2d-array' } }, // normal array
    ],
  });

  const shadowBindGroupLayout = createShadowBindGroupLayout(device);

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout],
  });

  const vertexModule = device.createShaderModule({ code: CLIPMAP_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: CLIPMAP_FRAGMENT_SHADER });

  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: CLIPMAP_VERTEX_STRIDE_BYTES,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' },
    ],
  };

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: vertexModule, entryPoint: 'main', buffers: [vertexBufferLayout] },
    fragment: { module: fragmentModule, entryPoint: 'main', targets: [{ format: HDR_FORMAT }] },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
  });

  // --- Shadow pipeline ---
  const shadowObjectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float', viewDimension: '2d' } },
    ],
  });

  const shadowLightVPBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const shadowLayout = device.createPipelineLayout({
    bindGroupLayouts: [shadowObjectBindGroupLayout, shadowLightVPBindGroupLayout],
  });

  const shadowModule = device.createShaderModule({ code: CLIPMAP_SHADOW_VERTEX_SHADER });

  const shadowPipeline = device.createRenderPipeline({
    layout: shadowLayout,
    vertex: { module: shadowModule, entryPoint: 'main', buffers: [vertexBufferLayout] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth32float',
      depthBias: 2,
      depthBiasSlopeScale: 2.0,
    },
  });

  // --- SSAO erase pipeline ---
  // Same vertex layout/bind groups as shadow, but outputs 1.0 to r16float color target
  // with read-only depth testing against the depth prepass texture.
  const eraseModule = device.createShaderModule({ code: CLIPMAP_SSAO_ERASE_SHADER });
  const eraseLayout = device.createPipelineLayout({
    bindGroupLayouts: [shadowObjectBindGroupLayout, shadowLightVPBindGroupLayout],
  });
  const ssaoErasePipeline = device.createRenderPipeline({
    layout: eraseLayout,
    vertex: { module: eraseModule, entryPoint: 'vs', buffers: [vertexBufferLayout] },
    fragment: { module: eraseModule, entryPoint: 'fs', targets: [{ format: 'r16float' as GPUTextureFormat }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
      format: 'depth32float',
    },
  });

  return {
    pipeline,
    objectBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
    shadowPipeline,
    shadowObjectBindGroupLayout,
    shadowLightVPBindGroupLayout,
    ssaoErasePipeline,
  };
}
