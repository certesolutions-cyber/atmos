import { GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER } from './grid-shader.js';
import { MSAA_SAMPLE_COUNT, HDR_FORMAT } from './pipeline.js';

/** Uniform layout: viewProjection(64) + cameraPos(12) + pad(4) = 80 bytes */
const UNIFORM_SIZE = 80;

export class GridRenderer {
  private readonly _pipeline: GPURenderPipeline;
  private readonly _uniformBuffer: GPUBuffer;
  private readonly _bindGroup: GPUBindGroup;
  private readonly _uniformData = new Float32Array(UNIFORM_SIZE / 4);

  constructor(device: GPUDevice, _format: GPUTextureFormat) {
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const vertModule = device.createShaderModule({ code: GRID_VERTEX_SHADER });
    const fragModule = device.createShaderModule({ code: GRID_FRAGMENT_SHADER });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vertModule,
        entryPoint: 'vs',
      },
      fragment: {
        module: fragModule,
        entryPoint: 'fs',
        targets: [
          {
            format: HDR_FORMAT,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      multisample: { count: MSAA_SAMPLE_COUNT },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
      },
    });

    this._uniformBuffer = device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
    });
  }

  render(
    pass: GPURenderPassEncoder,
    device: GPUDevice,
    viewProjection: Float32Array,
    cameraPos: Float32Array,
  ): void {
    // Write uniforms: VP matrix (16 floats) + cameraPos (3 floats) + 1 pad
    this._uniformData.set(viewProjection, 0);
    this._uniformData[16] = cameraPos[0]!;
    this._uniformData[17] = cameraPos[1]!;
    this._uniformData[18] = cameraPos[2]!;
    this._uniformData[19] = 0; // padding
    device.queue.writeBuffer(this._uniformBuffer, 0, this._uniformData);

    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.draw(6); // 2 triangles, 6 vertices
  }

  destroy(): void {
    this._uniformBuffer.destroy();
  }
}
