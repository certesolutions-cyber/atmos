/**
 * SkyPass — renders a procedural sky into the main render pass.
 * Uses a fullscreen triangle at z=1.0 with depth write OFF, depth compare 'always'.
 */

import { SKY_SHADER, SKY_UNIFORM_SIZE } from './sky-shader.js';
import { HDR_FORMAT, MSAA_SAMPLE_COUNT } from './pipeline.js';

export class SkyPass {
  private readonly _pipeline: GPURenderPipeline;
  private readonly _uniformBuffer: GPUBuffer;
  private readonly _bindGroup: GPUBindGroup;
  private readonly _data = new Float32Array(SKY_UNIFORM_SIZE / 4);

  constructor(device: GPUDevice) {
    const module = device.createShaderModule({ code: SKY_SHADER });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: HDR_FORMAT }],
      },
      multisample: { count: MSAA_SAMPLE_COUNT },
      primitive: {
        topology: 'triangle-list',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
    });

    this._uniformBuffer = device.createBuffer({
      size: SKY_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
      ],
    });
  }

  /**
   * Update sky uniforms. Call before draw().
   * @param invVP — inverse view-projection matrix (16 floats)
   * @param sunDir — normalized sun direction in world space (3 floats)
   * @param sunIntensity — HDR intensity multiplier for sun disc/glow
   * @param zenithColor — sky color at zenith (3 floats, linear)
   * @param horizonColor — sky color at horizon (3 floats, linear)
   */
  update(
    device: GPUDevice,
    invVP: Float32Array,
    sunDir: Float32Array,
    sunIntensity: number,
    zenithColor: Float32Array,
    horizonColor: Float32Array,
    groundColor: Float32Array,
    groundFalloff: number,
  ): void {
    const d = this._data;
    // mat4x4 invVP (offset 0, 16 floats)
    d.set(invVP, 0);
    // sunDir vec4 (offset 16)
    d[16] = sunDir[0]!; d[17] = sunDir[1]!; d[18] = sunDir[2]!; d[19] = 0;
    // zenithColor vec4 (offset 20)
    d[20] = zenithColor[0]!; d[21] = zenithColor[1]!; d[22] = zenithColor[2]!; d[23] = 1;
    // horizonColor vec4 (offset 24)
    d[24] = horizonColor[0]!; d[25] = horizonColor[1]!; d[26] = horizonColor[2]!; d[27] = 1;
    // groundColor vec4 (offset 28)
    d[28] = groundColor[0]!; d[29] = groundColor[1]!; d[30] = groundColor[2]!; d[31] = 1;
    // params vec4 (offset 32): x = sunIntensity, y = groundFalloff
    d[32] = sunIntensity; d[33] = groundFalloff; d[34] = 0; d[35] = 0;

    device.queue.writeBuffer(this._uniformBuffer, 0, d as GPUAllowSharedBufferSource);
  }

  /** Draw sky into the current render pass. */
  draw(pass: GPURenderPassEncoder): void {
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.draw(3);
  }

  destroy(): void {
    this._uniformBuffer.destroy();
  }
}
