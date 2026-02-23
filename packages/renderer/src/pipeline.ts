import { VERTEX_SHADER, FRAGMENT_SHADER } from './shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { createShadowBindGroupLayout } from './shadow-uniforms.js';

export interface PipelineResources {
  pipeline: GPURenderPipeline;
  objectBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  shadowBindGroupLayout: GPUBindGroupLayout;
  /** @deprecated Use objectBindGroupLayout instead */
  bindGroupLayout: GPUBindGroupLayout;
}

/** HDR format used for the MSAA resolve target */
export const HDR_FORMAT: GPUTextureFormat = 'rgba16float';
export const MSAA_SAMPLE_COUNT = 4;

export function createRenderPipeline(
  device: GPUDevice,
  _format: GPUTextureFormat,
): PipelineResources {
  const vertexModule = device.createShaderModule({ code: VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: FRAGMENT_SHADER });

  // Group 0: per-object uniforms (MVP + model + normalMatrix) – vertex stage
  const objectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });

  // Group 1: per-material + per-scene uniforms + textures – fragment stage
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

  const shadowBindGroupLayout = createShadowBindGroupLayout(device);

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: VERTEX_STRIDE_BYTES,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },      // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' },     // normal
            { shaderLocation: 2, offset: 24, format: 'float32x2' },     // uv
          ],
        },
      ],
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

  return {
    pipeline,
    objectBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
    bindGroupLayout: objectBindGroupLayout,
  };
}
