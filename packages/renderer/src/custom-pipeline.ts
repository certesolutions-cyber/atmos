/**
 * Creates a WebGPU render pipeline for a custom WGSL fragment shader.
 *
 * Uses the same vertex shader, object bind group (group 0), and shadow bind
 * group (group 2) as the standard PBR pipeline. Group 1 is dynamically
 * generated from the CustomShaderDescriptor. Group 3 provides scene depth.
 */

import type { CustomShaderDescriptor } from './custom-shader-parser.js';
import type { PipelineResources } from './pipeline.js';
import { VERTEX_SHADER } from './shader.js';
import { VERTEX_STRIDE_BYTES } from './geometry.js';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT } from './pipeline.js';
import { generateCustomFragmentShader, generateCustomVertexShader, generateCustomShadowVertexShader } from './custom-shader-codegen.js';

export interface CustomPipelineResources extends PipelineResources {
  descriptor: CustomShaderDescriptor;
  depthBindGroupLayout: GPUBindGroupLayout;
  /** Shadow pipeline for custom vertex displacement (null if no vertex code). */
  shadowPipeline: GPURenderPipeline | null;
  /** Bind group layout for group 2 in shadow pipeline (scene + custom uniforms). */
  shadowExtraBindGroupLayout: GPUBindGroupLayout | null;
}

export async function createCustomPipeline(
  device: GPUDevice,
  descriptor: CustomShaderDescriptor,
  objectBindGroupLayout: GPUBindGroupLayout,
  shadowBindGroupLayout: GPUBindGroupLayout,
): Promise<CustomPipelineResources | null> {
  const hasVertexCode = !!descriptor.vertexSource;

  // Use custom or standard vertex shader
  const vertexCode = hasVertexCode ? generateCustomVertexShader(descriptor) : VERTEX_SHADER;
  const vertexModule = device.createShaderModule({ code: vertexCode });

  const fragmentCode = generateCustomFragmentShader(descriptor);
  const fragmentModule = device.createShaderModule({ code: fragmentCode });

  // Check for compilation errors on both modules
  const modules = [
    { mod: fragmentModule, label: 'fragment' },
    ...(hasVertexCode ? [{ mod: vertexModule, label: 'vertex' }] : []),
  ];
  for (const { mod, label } of modules) {
    const info = await mod.getCompilationInfo();
    for (const msg of info.messages) {
      const loc = msg.lineNum ? `:${msg.lineNum}:${msg.linePos}` : '';
      const text = `[CustomShader:${label}] ${msg.type}${loc}: ${msg.message}`;
      if (msg.type === 'error') {
        console.error(text);
      } else {
        console.warn(text);
      }
    }
    if (info.messages.some((m) => m.type === 'error')) {
      return null;
    }
  }

  // Uniform visibility: VERTEX | FRAGMENT when custom vertex code exists
  const uniformVisibility = hasVertexCode
    ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
    : GPUShaderStage.FRAGMENT;

  // Build material bind group layout (group 1) from descriptor
  const materialEntries: GPUBindGroupLayoutEntry[] = [
    // binding 0: custom uniforms
    { binding: 0, visibility: uniformVisibility, buffer: { type: 'uniform' } },
    // binding 1: scene uniforms
    { binding: 1, visibility: uniformVisibility, buffer: { type: 'uniform' } },
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

  // Group 3: scene depth texture for depth-based effects (transparency, water)
  const depthBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [objectBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout, depthBindGroupLayout],
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
        ...(!descriptor.opaque ? {
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        } : {}),
      }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: {
      topology: 'triangle-list',
      cullMode: descriptor.opaque ? 'back' : 'none',
    },
    depthStencil: {
      depthWriteEnabled: descriptor.opaque,
      depthCompare: descriptor.opaque ? 'less' : 'less-equal',
      format: 'depth24plus',
    },
  });

  // Build shadow pipeline for custom vertex displacement
  let shadowPipeline: GPURenderPipeline | null = null;
  let shadowExtraBindGroupLayout: GPUBindGroupLayout | null = null;

  if (hasVertexCode) {
    const shadowVertexCode = generateCustomShadowVertexShader(descriptor);
    const shadowModule = device.createShaderModule({ code: shadowVertexCode });
    const shadowInfo = await shadowModule.getCompilationInfo();
    const hasError = shadowInfo.messages.some((m) => m.type === 'error');
    if (hasError) {
      for (const msg of shadowInfo.messages) {
        if (msg.type === 'error') {
          const loc = msg.lineNum ? `:${msg.lineNum}:${msg.linePos}` : '';
          console.error(`[CustomShader:shadow] error${loc}: ${msg.message}`);
        }
      }
    } else {
      // Group 1: lightVP (same layout as standard shadow passes)
      const lightVPBGL = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        ],
      });

      // Group 2: scene + custom uniforms for vertex displacement
      shadowExtraBindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        ],
      });

      const shadowLayout = device.createPipelineLayout({
        bindGroupLayouts: [objectBindGroupLayout, lightVPBGL, shadowExtraBindGroupLayout],
      });

      shadowPipeline = device.createRenderPipeline({
        layout: shadowLayout,
        vertex: {
          module: shadowModule,
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
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: 'less',
          format: 'depth32float',
          depthBias: 2,
          depthBiasSlopeScale: 2.0,
        },
      });
    }
  }

  return {
    pipeline,
    objectBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
    depthBindGroupLayout,
    bindGroupLayout: objectBindGroupLayout,
    descriptor,
    shadowPipeline,
    shadowExtraBindGroupLayout,
  };
}
