/**
 * Clipmap terrain GPU pipeline: main pass + shadow pass.
 *
 * Bind group layout:
 *   Group 0: object UBO(0) + level UBO(1) + heightmap texture(2)
 *   Group 1: material UBO(0) + scene UBO(1) + albedo texture(2) + sampler(3)
 *   Group 2: shadow uniforms (standard shadow bind group layout)
 *
 * Shadow pipeline layout:
 *   Group 0: same as main (object + level + heightmap)
 *   Group 1: lightVP UBO
 */

import {
  CLIPMAP_FRAGMENT_SHADER,
  CLIPMAP_VERTEX_SHADER,
  CLIPMAP_SHADOW_VERTEX_SHADER,
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

  // Group 1: material + scene + albedo
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
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

  return {
    pipeline,
    objectBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
    shadowPipeline,
    shadowObjectBindGroupLayout,
    shadowLightVPBindGroupLayout,
  };
}
