import { generateMipmaps } from './mipmap-generator.js';

export interface GPUTextureHandle {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
}

let _whiteFallback: GPUTextureHandle | null = null;

/** Returns a cached 1x1 white texture (avoids needing separate pipeline variants). */
export function getWhiteFallbackTexture(device: GPUDevice): GPUTextureHandle {
  if (_whiteFallback) return _whiteFallback;

  const texture = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array([255, 255, 255, 255]) as GPUAllowSharedBufferSource,
    { bytesPerRow: 4 },
    [1, 1],
  );
  const view = texture.createView();
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });

  _whiteFallback = { texture, view, sampler };
  return _whiteFallback;
}

/** Create a GPU texture from raw RGBA pixel data with auto-generated mipmaps.
 *  @param srgb If true (default), uses rgba8unorm-srgb so sRGB-encoded images
 *              are correctly decoded to linear on GPU read. Pass false for
 *              linear data textures (normal maps, metallic-roughness maps). */
export function createTextureFromRGBA(
  device: GPUDevice,
  data: Uint8Array,
  width: number,
  height: number,
  srgb = true,
): GPUTextureHandle {
  const format: GPUTextureFormat = srgb ? 'rgba8unorm-srgb' : 'rgba8unorm';
  const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
  const texture = device.createTexture({
    size: [width, height],
    format,
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.writeTexture(
    { texture },
    data as GPUAllowSharedBufferSource,
    { bytesPerRow: width * 4 },
    [width, height],
  );
  generateMipmaps(device, texture);
  const view = texture.createView();
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });
  return { texture, view, sampler };
}

let _flatNormalFallback: GPUTextureHandle | null = null;

/** Returns a cached 1x1 flat normal texture (127,127,255,255 = tangent-space up). */
export function getFlatNormalFallback(device: GPUDevice): GPUTextureHandle {
  if (_flatNormalFallback) return _flatNormalFallback;

  const texture = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array([127, 127, 255, 255]) as GPUAllowSharedBufferSource,
    { bytesPerRow: 4 },
    [1, 1],
  );
  const view = texture.createView();
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  _flatNormalFallback = { texture, view, sampler };
  return _flatNormalFallback;
}

let _defaultMRFallback: GPUTextureHandle | null = null;

/** Returns a cached 1x1 white metallic-roughness fallback (uniform values override). */
export function getDefaultMetallicRoughnessFallback(device: GPUDevice): GPUTextureHandle {
  if (_defaultMRFallback) return _defaultMRFallback;

  const texture = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // G=255 (roughness=1.0), B=255 (metallic=1.0) – multiplied by uniform values
  device.queue.writeTexture(
    { texture },
    new Uint8Array([255, 255, 255, 255]) as GPUAllowSharedBufferSource,
    { bytesPerRow: 4 },
    [1, 1],
  );
  const view = texture.createView();
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  _defaultMRFallback = { texture, view, sampler };
  return _defaultMRFallback;
}

/** Decode an image blob to RGBA pixel data using createImageBitmap. */
export async function decodeImageToRGBA(
  blob: Blob,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: new Uint8Array(imageData.data.buffer), width, height };
}
