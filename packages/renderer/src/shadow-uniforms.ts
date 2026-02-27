/**
 * Shadow mapping shared constants and bind group layout factories.
 *
 * Group 2 layout (main pass) — 12 bindings, 10 sampled textures:
 *   binding 0:     uniform buffer (848 bytes)
 *   binding 1:     comparison sampler
 *   binding 2–3:   dir cascade 0 depth maps (slots 0–1)
 *   binding 4–5:   dir cascade 1 depth maps (slots 0–1)
 *   binding 6–7:   point cubemaps (slots 0–1)
 *   binding 8–11:  spot depth maps (slots 0–3)
 *
 * Combined with group 1's 3 material textures = 13 per-stage sampled textures
 * (WebGPU maxSampledTexturesPerShaderStage limit is 16).
 *
 * Uniform layout (848 bytes):
 *   0–351     DirShadowSlot[2]   (176B each)
 *   352–415   PointShadowSlot[2] (32B each)
 *   416–799   SpotShadowSlot[4]  (96B each)
 *   800–815   dirLightToSlot     vec4<u32>
 *   816–831   pointLightToSlot   vec4<u32>
 *   832–847   spotLightToSlot    vec4<u32>
 */

export const SHADOW_UNIFORM_SIZE = 848;

export const MAX_DIR_SHADOW_SLOTS = 2;
export const MAX_POINT_SHADOW_SLOTS = 2;
export const MAX_SPOT_SHADOW_SLOTS = 4;

/** Sentinel u32 value indicating no shadow slot for a light index. */
export const SHADOW_SLOT_NONE = 0xFFFFFFFF;

export function createShadowBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      // 0: uniform buffer
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      // 1: comparison sampler
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      // 2–3: dir cascade 0 (2 slots)
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      // 4–5: dir cascade 1 (2 slots)
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      // 6–7: point cubemaps (2 slots)
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: 'cube' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: 'cube' } },
      // 8–11: spot depth maps (4 slots)
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 11, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });
}

export interface DummyShadowResources {
  uniformBuffer: GPUBuffer;
  dummy2DView: GPUTextureView;
  dummyCubeView: GPUTextureView;
  sampler: GPUSampler;
  bindGroup: GPUBindGroup;
}

export function createDummyShadowResources(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
): DummyShadowResources {
  const uniformBuffer = device.createBuffer({
    size: SHADOW_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const data = new ArrayBuffer(SHADOW_UNIFORM_SIZE);
  const u32 = new Uint32Array(data);
  // Set slot maps to sentinel (no shadow)
  const mapOffset32 = 800 / 4;
  for (let i = 0; i < 12; i++) u32[mapOffset32 + i] = SHADOW_SLOT_NONE;
  device.queue.writeBuffer(uniformBuffer, 0, data as GPUAllowSharedBufferSource);

  const tex2D = device.createTexture({
    size: [1, 1],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const dummy2DView = tex2D.createView();

  const texCube = device.createTexture({
    size: [1, 1, 6],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const dummyCubeView = texCube.createView({ dimension: 'cube' });

  const sampler = device.createSampler({ compare: 'less' });

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: dummy2DView },
      { binding: 3, resource: dummy2DView },
      { binding: 4, resource: dummy2DView },
      { binding: 5, resource: dummy2DView },
      { binding: 6, resource: dummyCubeView },
      { binding: 7, resource: dummyCubeView },
      { binding: 8, resource: dummy2DView },
      { binding: 9, resource: dummy2DView },
      { binding: 10, resource: dummy2DView },
      { binding: 11, resource: dummy2DView },
    ],
  });

  return { uniformBuffer, dummy2DView, dummyCubeView, sampler, bindGroup };
}
