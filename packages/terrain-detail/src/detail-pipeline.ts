/**
 * GPU pipeline for instanced detail billboard rendering.
 *
 * Bind group layout:
 *   Group 0: draw uniforms (viewProj, cameraPos+time, windDir+strength, fadeParams)
 *   Group 1: material UBO + scene UBO + albedo texture + sampler
 *   Group 2: shadow bind group (standard engine layout)
 */

import { HDR_FORMAT, MSAA_SAMPLE_COUNT, createShadowBindGroupLayout } from '@certe/atmos-renderer';
import { DETAIL_INSTANCE_STRIDE_BYTES } from './types.js';
import { DETAIL_VERTEX_SHADER, DETAIL_FRAGMENT_SHADER } from './detail-shader.js';

export interface DetailPipelineResources {
  pipeline: GPURenderPipeline;
  drawBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  shadowBindGroupLayout: GPUBindGroupLayout;
}

/**
 * Per-vertex buffer layout (slot 0): billboard quad
 * position(3) + uv(2) = 5 floats = 20 bytes
 */
const VERTEX_STRIDE_BYTES = 20;

const VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VERTEX_STRIDE_BYTES,
  stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },   // position
    { shaderLocation: 1, offset: 12, format: 'float32x2' },  // uv
  ],
};

/** Per-instance buffer layout (slot 1): pos(3)+rotY(1)+scale(1)+colorShift(1)+pad(2) = 32B */
const INSTANCE_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: DETAIL_INSTANCE_STRIDE_BYTES,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 2, offset: 0, format: 'float32x3' },   // instPos
    { shaderLocation: 3, offset: 12, format: 'float32' },    // instRotY
    { shaderLocation: 4, offset: 16, format: 'float32' },    // instScale
    { shaderLocation: 5, offset: 20, format: 'float32' },    // instColorShift
  ],
};

export function createDetailPipeline(device: GPUDevice): DetailPipelineResources {
  // Group 0: draw uniforms (viewProj + cameraPos + windDir + fadeParams = 128B)
  const drawBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  // Group 1: material UBO + scene UBO + texture + sampler
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  // Group 2: shadow
  const shadowBindGroupLayout = createShadowBindGroupLayout(device);

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [drawBindGroupLayout, materialBindGroupLayout, shadowBindGroupLayout],
  });

  const vertModule = device.createShaderModule({ code: DETAIL_VERTEX_SHADER });
  const fragModule = device.createShaderModule({ code: DETAIL_FRAGMENT_SHADER });

  const buffers = [VERTEX_BUFFER_LAYOUT, INSTANCE_BUFFER_LAYOUT];

  // Billboard pipeline: double-sided (no culling), alpha-tested
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: vertModule, entryPoint: 'main', buffers },
    fragment: {
      module: fragModule,
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

  return {
    pipeline,
    drawBindGroupLayout,
    materialBindGroupLayout,
    shadowBindGroupLayout,
  };
}

/**
 * Create a cross-billboard quad mesh: two quads at 90 degrees.
 * Each quad is width x height, centered on X, bottom at Y=0.
 *
 * Vertex format: pos(3) + uv(2) = 5 floats per vertex.
 */
export function createCrossBillboardQuad(width: number, height: number): { vertices: Float32Array; indices: Uint16Array } {
  const hw = width * 0.5;

  // Quad 1: along X axis
  // Quad 2: along Z axis (rotated 90 degrees)
  // 8 vertices total, 12 indices (4 triangles)
  const vertices = new Float32Array([
    // Quad 1 (X-aligned)
    -hw, 0,      0,   0, 1,  // bottom-left
     hw, 0,      0,   1, 1,  // bottom-right
     hw, height, 0,   1, 0,  // top-right
    -hw, height, 0,   0, 0,  // top-left
    // Quad 2 (Z-aligned)
    0, 0,       -hw,  0, 1,
    0, 0,        hw,  1, 1,
    0, height,   hw,  1, 0,
    0, height,  -hw,  0, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2,  0, 2, 3,  // Quad 1
    4, 5, 6,  4, 6, 7,  // Quad 2
  ]);

  return { vertices, indices };
}
