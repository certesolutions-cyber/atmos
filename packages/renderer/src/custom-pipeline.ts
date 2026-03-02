/**
 * Creates a WebGPU render pipeline for a custom WGSL fragment shader.
 *
 * Uses the same vertex shader, object bind group (group 0), and shadow bind
 * group (group 2) as the standard PBR pipeline. Group 1 is dynamically
 * generated from the CustomShaderDescriptor.
 */

import type { CustomShaderDescriptor } from './custom-shader-parser.js';
import type { PipelineResources } from './pipeline.js';
import { VERTEX_SHADER } from './shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT } from './pipeline.js';
import { generateCustomFragmentShader } from './custom-shader-codegen.js';

export interface CustomPipelineResources extends PipelineResources {
  descriptor: CustomShaderDescriptor;
}

export async function createCustomPipeline(
  device: GPUDevice,
  descriptor: CustomShaderDescriptor,
  objectBindGroupLayout: GPUBindGroupLayout,
  shadowBindGroupLayout: GPUBindGroupLayout,
): Promise<CustomPipelineResources | null> {
  const vertexModule = device.createShaderModule({ code: VERTEX_SHADER });

  const fragmentCode = generateCustomFragmentShader(descriptor);
  const fragmentModule = device.createShaderModule({ code: fragmentCode });

  // Check for compilation errors
  const info = await fragmentModule.getCompilationInfo();
  for (const msg of info.messages) {
    const loc = msg.lineNum ? `:${msg.lineNum}:${msg.linePos}` : '';
    const text = `[CustomShader] ${msg.type}${loc}: ${msg.message}`;
    if (msg.type === 'error') {
      console.error(text);
    } else {
      console.warn(text);
    }
  }
  if (info.messages.some((m) => m.type === 'error')) {
    return null;
  }

  // Build material bind group layout (group 1) from descriptor
  const materialEntries: GPUBindGroupLayoutEntry[] = [
    // binding 0: custom uniforms
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    // binding 1: scene uniforms
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  ];

  for (const tex of descriptor.textures) {
    materialEntries.push({
      binding: tex.bindingIndex,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' },
    });
    materialEntries.push({
      binding: tex.samplerBindingIndex,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    });
  }

  const materialBindGroupLayout = device.createBindGroupLayout({ entries: materialEntries });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
      buffers: [{
        arrayStride: VERTEX_STRIDE_BYTES,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
          { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
          { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
        ],
      }],
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'main',
      targets: [{
        format: HDR_FORMAT,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
      format: 'depth24plus',
    },
  });

  return {
    pipeline,
    objectBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
    bindGroupLayout: objectBindGroupLayout,
    descriptor,
  };
}
