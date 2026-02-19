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
    new Uint8Array([255, 255, 255, 255]),
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

/** Create a GPU texture from raw RGBA pixel data. */
export function createTextureFromRGBA(
  device: GPUDevice,
  data: Uint8Array,
  width: number,
  height: number,
): GPUTextureHandle {
  const texture = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    data,
    { bytesPerRow: width * 4 },
    [width, height],
  );
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
