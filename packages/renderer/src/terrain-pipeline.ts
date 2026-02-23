/**
 * Terrain splat-map render pipeline.
 *
 * Vertex format 40B: pos(3) + normal(3) + uv(2) + splatWeights(2) = 10 floats.
 * Material bind group carries 3 splat textures + shared sampler instead of
 * normal/MR maps used by the standard PBR pipeline.
 */

import { TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER } from './terrain-shader.js';
import { createShadowBindGroupLayout } from './shadow-uniforms.js';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT } from './pipeline.js';

export const TERRAIN_VERTEX_STRIDE_FLOATS = 10;
export const TERRAIN_VERTEX_STRIDE_BYTES = 40;

export interface TerrainPipelineResources {
  pipeline: GPURenderPipeline;
  objectBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  shadowBindGroupLayout: GPUBindGroupLayout;
}

export function createTerrainPipeline(
  device: GPUDevice,
  _format: GPUTextureFormat,
): TerrainPipelineResources {
  const vertexModule = device.createShaderModule({ code: TERRAIN_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: TERRAIN_FRAGMENT_SHADER });

  // Group 0: per-object uniforms (MVP + model + normalMatrix) – vertex stage
  const objectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  // Group 1: material UBO + scene UBO + 3 splat textures + sampler
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const shadowBindGroupLayout = createShadowBindGroupLayout(device);

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
      buffers: [{
        arrayStride: TERRAIN_VERTEX_STRIDE_BYTES,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },   // position
          { shaderLocation: 1, offset: 12, format: 'float32x3' },  // normal
          { shaderLocation: 2, offset: 24, format: 'float32x2' },  // uv
          { shaderLocation: 3, offset: 32, format: 'float32x2' },  // splatWeights
        ],
      }],
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'main',
      targets: [{ format: HDR_FORMAT }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  return { pipeline, objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout };
}
