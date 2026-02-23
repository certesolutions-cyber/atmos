import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { MSAA_SAMPLE_COUNT, HDR_FORMAT } from './pipeline.js';

const WIREFRAME_SHADER = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> obj: Uniforms;

struct ColorUniform {
  color: vec4<f32>,
};

@group(1) @binding(0) var<uniform> wireColor: ColorUniform;

@vertex
fn vs(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return obj.mvp * vec4<f32>(position, 1.0);
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return wireColor.color;
}
`;

export interface WireframePipelineResources {
  pipeline: GPURenderPipeline;
  objectBindGroupLayout: GPUBindGroupLayout;
  colorBindGroupLayout: GPUBindGroupLayout;
}

export function createWireframePipeline(
  device: GPUDevice,
): WireframePipelineResources {
  const shaderModule = device.createShaderModule({ code: WIREFRAME_SHADER });

  const objectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const colorBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, colorBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: VERTEX_STRIDE_BYTES, // reuse PBR vertex buffer, only read position
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs',
      targets: [{ format: HDR_FORMAT }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: {
      topology: 'line-list',
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
    },
  });

  return { pipeline, objectBindGroupLayout, colorBindGroupLayout };
}
