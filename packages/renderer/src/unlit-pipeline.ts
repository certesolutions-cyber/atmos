import { UNLIT_VERTEX_SHADER, UNLIT_FRAGMENT_SHADER } from './unlit-shader.js';
import { MSAA_SAMPLE_COUNT, HDR_FORMAT } from './pipeline.js';

export interface UnlitPipelineResources {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export interface UnlitPipelineOptions {
  depthWrite?: boolean;
  topology?: GPUPrimitiveTopology;
  depthCompare?: GPUCompareFunction;
  blend?: boolean;
}

export function createUnlitPipeline(
  device: GPUDevice,
  _format: GPUTextureFormat,
  opts?: UnlitPipelineOptions,
): UnlitPipelineResources {
  const depthWrite = opts?.depthWrite ?? false;
  const topology = opts?.topology ?? 'triangle-list';
  const depthCompare = opts?.depthCompare ?? 'always';
  const blend = opts?.blend ?? false;

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const vertexModule = device.createShaderModule({ code: UNLIT_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: UNLIT_FRAGMENT_SHADER });

  const colorTarget: GPUColorTargetState = { format: HDR_FORMAT };
  if (blend) {
    colorTarget.blend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
  }

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 24, // position(3) + color(3) = 6 floats * 4 bytes
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'fs',
      targets: [colorTarget],
    },
    multisample: { count: MSAA_SAMPLE_COUNT },
    primitive: { topology },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: depthWrite,
      depthCompare,
    },
  });

  return { pipeline, bindGroupLayout };
}
