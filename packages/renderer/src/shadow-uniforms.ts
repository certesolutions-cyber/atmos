/**
 * Shadow mapping shared constants and bind group layout factories.
 *
 * Group 2 layout (main pass):
 *   binding 0: uniform buffer (cascade VPs + biases + enables + extras)
 *   binding 1: cascade 0 (near) directional shadow map (texture_depth_2d)
 *   binding 2: comparison sampler
 *   binding 3: point shadow cube map (texture_depth_cube)
 *   binding 4: cascade 1 (far) directional shadow map (texture_depth_2d)
 *   binding 5: spot shadow map (texture_depth_2d)
 *
 * Uniform layout (272 bytes):
 *   0-63   mat4x4  cascade0VP
 *   64-127 mat4x4  cascade1VP
 *   128    f32     dirShadowBias
 *   132    u32     dirShadowEnabled
 *   136    f32     pointShadowBias
 *   140    u32     pointShadowEnabled
 *   144-159 vec4   pointLightPos (xyz=pos, w=far)
 *   160    f32     dirShadowIntensity
 *   164    f32     pointShadowIntensity
 *   168    f32     cascadeSplit (camera distance for cascade transition)
 *   172    f32     cascadeBlendWidth
 *   176-239 mat4x4 spotShadowVP
 *   240-255 vec4   spotLightPosAndFar (xyz=pos, w=far)
 *   256    f32     spotShadowBias
 *   260    u32     spotShadowEnabled
 *   264    f32     spotShadowIntensity
 *   268    f32     _pad
 */

export const SHADOW_UNIFORM_SIZE = 272;

export function createShadowBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: 'cube' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });
}

export interface DummyShadowResources {
  uniformBuffer: GPUBuffer;
  textureView: GPUTextureView;
  textureView1: GPUTextureView;
  cubeTextureView: GPUTextureView;
  spotTextureView: GPUTextureView;
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
  // dirShadowEnabled=0, pointShadowEnabled=0, spotShadowEnabled=0
  new Uint32Array(data, 132, 1)[0] = 0;
  new Uint32Array(data, 140, 1)[0] = 0;
  new Uint32Array(data, 260, 1)[0] = 0;
  device.queue.writeBuffer(uniformBuffer, 0, data);

  // 2D dummy for directional shadow cascade 0
  const texture2d = device.createTexture({
    size: [1, 1],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const textureView = texture2d.createView();

  // 2D dummy for directional shadow cascade 1
  const texture2d1 = device.createTexture({
    size: [1, 1],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const textureView1 = texture2d1.createView();

  // Cube dummy for point shadow (1x1x6)
  const textureCube = device.createTexture({
    size: [1, 1, 6],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const cubeTextureView = textureCube.createView({ dimension: 'cube' });

  // 2D dummy for spot shadow
  const textureSpot = device.createTexture({
    size: [1, 1],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const spotTextureView = textureSpot.createView();

  const sampler = device.createSampler({ compare: 'less' });

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: textureView },
      { binding: 2, resource: sampler },
      { binding: 3, resource: cubeTextureView },
      { binding: 4, resource: textureView1 },
      { binding: 5, resource: spotTextureView },
    ],
  });

  return { uniformBuffer, textureView, textureView1, cubeTextureView, spotTextureView, sampler, bindGroup };
}
