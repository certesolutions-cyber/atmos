/**
 * GPU pipelines for instanced tree rendering: trunk, leaf, billboard, + shadows.
 *
 * Bind group layout:
 *   Group 0: draw uniforms (viewProj, cameraPos+time, windDir+strength)
 *   Group 1: material UBO + scene UBO + albedo texture + sampler
 *   Group 2: shadow bind group (standard engine layout)
 *
 * Shadow pipeline layout:
 *   Group 0: draw uniforms
 *   Group 1: lightVP UBO
 */

import { HDR_FORMAT, MSAA_SAMPLE_COUNT, createShadowBindGroupLayout } from '@certe/atmos-renderer';
import { TREE_VERTEX_STRIDE_BYTES, INSTANCE_STRIDE_BYTES } from './types.js';
import {
  TREE_TRUNK_VERTEX_SHADER,
  TREE_TRUNK_FRAGMENT_SHADER,
  TREE_LEAF_VERTEX_SHADER,
  TREE_LEAF_FRAGMENT_SHADER,
  TREE_SHADOW_VERTEX_SHADER,
} from './tree-shader.js';

export interface TreePipelineResources {
  trunkPipeline: GPURenderPipeline;
  leafPipeline: GPURenderPipeline;
  billboardPipeline: GPURenderPipeline;
  drawBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  shadowBindGroupLayout: GPUBindGroupLayout;
  trunkShadowPipeline: GPURenderPipeline;
  leafShadowPipeline: GPURenderPipeline;
  shadowDrawBindGroupLayout: GPUBindGroupLayout;
  shadowLightVPBindGroupLayout: GPUBindGroupLayout;
}

/** Per-vertex buffer layout (slot 0): pos(3)+normal(3)+uv(2)+windWeight(1)+branchLevel(1) = 40B */
const VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: TREE_VERTEX_STRIDE_BYTES,
  stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },   // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' },  // normal
    { shaderLocation: 2, offset: 24, format: 'float32x2' },  // uv
    { shaderLocation: 3, offset: 32, format: 'float32' },    // windWeight
    { shaderLocation: 4, offset: 36, format: 'float32' },    // branchLevel
  ],
};

/** Per-instance buffer layout (slot 1): pos(3)+rotY(1)+scale(1)+windPhase(1)+pad(2) = 32B */
const INSTANCE_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: INSTANCE_STRIDE_BYTES,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 5, offset: 0, format: 'float32x3' },   // instPos
    { shaderLocation: 6, offset: 12, format: 'float32' },    // instRotY
    { shaderLocation: 7, offset: 16, format: 'float32' },    // instScale
    { shaderLocation: 8, offset: 20, format: 'float32' },    // windPhase
  ],
};

export function createTreePipeline(device: GPUDevice): TreePipelineResources {
  // Group 0: draw uniforms (viewProj mat4 + cameraPos vec4 + windDir vec4 = 96B)
  const drawBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  // Group 1: material UBO + scene UBO + albedo texture + sampler + normal texture + normal sampler
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  // Group 2: shadow
  const shadowBindGroupLayout = createShadowBindGroupLayout(device);

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [drawBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout],
  });

  const trunkVertModule = device.createShaderModule({ code: TREE_TRUNK_VERTEX_SHADER });
  const trunkFragModule = device.createShaderModule({ code: TREE_TRUNK_FRAGMENT_SHADER });
  const leafVertModule = device.createShaderModule({ code: TREE_LEAF_VERTEX_SHADER });
  const leafFragModule = device.createShaderModule({ code: TREE_LEAF_FRAGMENT_SHADER });

  const buffers = [VERTEX_BUFFER_LAYOUT, INSTANCE_BUFFER_LAYOUT];

  // Trunk pipeline: back-face culled
  const trunkPipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: trunkVertModule, entryPoint: 'main', buffers },
    fragment: { module: trunkFragModule, entryPoint: 'main', targets: [{ format: HDR_FORMAT }] },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
  });

  // Leaf pipeline: no culling (double-sided)
  const leafPipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: leafVertModule, entryPoint: 'main', buffers },
    fragment: {
      module: leafFragModule,
      entryPoint: 'main',
      targets: [{
        format: HDR_FORMAT,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
        },
      }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
  });

  // Billboard pipeline: same as leaf (double-sided, alpha test)
  const billboardPipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: leafVertModule, entryPoint: 'main', buffers },
    fragment: {
      module: leafFragModule,
      entryPoint: 'main',
      targets: [{
        format: HDR_FORMAT,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
        },
      }],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
  });

  // --- Shadow pipelines ---
  const shadowDrawBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const shadowLightVPBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const shadowLayout = device.createPipelineLayout({
    bindGroupLayouts: [shadowDrawBindGroupLayout, shadowLightVPBindGroupLayout],
  });

  const shadowModule = device.createShaderModule({ code: TREE_SHADOW_VERTEX_SHADER });

  // Trunk shadow: depth only, no fragment
  const trunkShadowPipeline = device.createRenderPipeline({
    layout: shadowLayout,
    vertex: { module: shadowModule, entryPoint: 'main', buffers },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth32float',
      depthBias: 2,
      depthBiasSlopeScale: 2.0,
    },
  });

  // Leaf shadow: same depth-only (alpha-tested shadows would need fragment stage)
  const leafShadowPipeline = device.createRenderPipeline({
    layout: shadowLayout,
    vertex: { module: shadowModule, entryPoint: 'main', buffers },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth32float',
      depthBias: 2,
      depthBiasSlopeScale: 2.0,
    },
  });

  return {
    trunkPipeline,
    leafPipeline,
    billboardPipeline,
    drawBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
    trunkShadowPipeline,
    leafShadowPipeline,
    shadowDrawBindGroupLayout,
    shadowLightVPBindGroupLayout,
  };
}
