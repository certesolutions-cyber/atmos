/**
 * Blit-based mipmap generator for WebGPU textures.
 * Creates each mip level by rendering a fullscreen triangle with linear filtering.
 */

const MIPMAP_SHADER = /* wgsl */`
var<private> pos: array<vec2<f32>, 3> = array(
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0),
);

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
  var out: VertexOutput;
  let p = pos[i];
  out.position = vec4(p, 0.0, 1.0);
  out.uv = p * vec2(0.5, -0.5) + vec2(0.5);
  return out;
}

@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(srcTexture, srcSampler, uv);
}
`;

interface MipPipelineCache {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  bindGroupLayout: GPUBindGroupLayout;
}

const _cache = new WeakMap<GPUDevice, Map<GPUTextureFormat, MipPipelineCache>>();

function getOrCreatePipeline(device: GPUDevice, format: GPUTextureFormat): MipPipelineCache {
  let formatMap = _cache.get(device);
  if (!formatMap) {
    formatMap = new Map();
    _cache.set(device, formatMap);
  }
  const cached = formatMap.get(format);
  if (cached) return cached;

  const module = device.createShaderModule({ code: MIPMAP_SHADER });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const entry: MipPipelineCache = { pipeline, sampler, bindGroupLayout };
  formatMap.set(format, entry);
  return entry;
}

/** Generate mipmaps for a texture using blit-based downsampling. */
export function generateMipmaps(device: GPUDevice, texture: GPUTexture): void {
  const mipCount = texture.mipLevelCount;
  if (mipCount <= 1) return;

  const format = texture.format as GPUTextureFormat;
  const { pipeline, sampler, bindGroupLayout } = getOrCreatePipeline(device, format);
  const encoder = device.createCommandEncoder();

  for (let level = 1; level < mipCount; level++) {
    const srcView = texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 });
    const dstView = texture.createView({ baseMipLevel: level, mipLevelCount: 1 });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: sampler },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: dstView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  device.queue.submit([encoder.finish()]);
}
