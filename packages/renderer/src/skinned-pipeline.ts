/**
 * Skinned PBR render pipeline.
 * Same bind groups 0-2 as the regular PBR pipeline, plus group 3 for bone matrices (storage buffer).
 */

import { SKINNED_VERTEX_SHADER } from './skinned-shader.js';
import { FRAGMENT_SHADER } from './shader.js';
import { SKINNED_VERTEX_BUFFER_LAYOUT, SKINNED_VERTEX_STRIDE_BYTES } from './skinned-geometry.js';
import { SKINNED_SHADOW_VERTEX_SHADER } from './skinned-shadow-shader.js';
import { createShadowBindGroupLayout } from './shadow-uniforms.js';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT } from './pipeline.js';

export interface SkinnedPipelineResources {
  pipeline: GPURenderPipeline;
  objectBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  shadowBindGroupLayout: GPUBindGroupLayout;
  boneBindGroupLayout: GPUBindGroupLayout;
  /** Shadow pipeline for skinned meshes (depth-only with skinning). */
  shadowPipeline: GPURenderPipeline;
  shadowBoneBGL: GPUBindGroupLayout;
}

export function createSkinnedPBRPipeline(
  device: GPUDevice,
  _format: GPUTextureFormat,
): SkinnedPipelineResources {
  const vertexModule = device.createShaderModule({ code: SKINNED_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: FRAGMENT_SHADER });

  // Group 0: per-object uniforms (same as regular pipeline)
  const objectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  // Group 1: material + scene (same as regular pipeline)
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  // Group 2: shadows
  const shadowBindGroupLayout = createShadowBindGroupLayout(device);

  // Group 3: bone matrices (storage buffer, vertex stage)
  const boneBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout, boneBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
      buffers: [SKINNED_VERTEX_BUFFER_LAYOUT],
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'main',
      targets: [{ format: HDR_FORMAT }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // --- Skinned shadow pipeline ---
  const shadowShaderModule = device.createShaderModule({ code: SKINNED_SHADOW_VERTEX_SHADER });

  const shadowLightVPBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const shadowBoneBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  const shadowPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, shadowLightVPBGL, shadowBoneBGL],
  });

  const shadowPipeline = device.createRenderPipeline({
    layout: shadowPipelineLayout,
    vertex: {
      module: shadowShaderModule,
      entryPoint: 'main',
      buffers: [{
        arrayStride: SKINNED_VERTEX_STRIDE_BYTES,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },    // position
          { shaderLocation: 3, offset: 32, format: 'uint8x4' },     // joints
          { shaderLocation: 4, offset: 36, format: 'float32x4' },   // weights
        ],
      }],
    },
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
    boneBindGroupLayout,
    shadowPipeline,
    shadowBoneBGL,
  };
}
