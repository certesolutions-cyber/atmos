export interface GPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  depthTexture: GPUTexture;
  msaaTexture: GPUTexture;
  hdrTexture: GPUTexture;
  canvas: HTMLCanvasElement;
}

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';
const SAMPLE_COUNT = 4;

function createMSAATexture(device: GPUDevice, w: number, h: number): GPUTexture {
  return device.createTexture({
    size: { width: w, height: h },
    format: HDR_FORMAT,
    sampleCount: SAMPLE_COUNT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

function createHDRTexture(device: GPUDevice, w: number, h: number): GPUTexture {
  return device.createTexture({
    size: { width: w, height: h },
    format: HDR_FORMAT,
    sampleCount: 1,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

function createDepthTexture(device: GPUDevice, w: number, h: number): GPUTexture {
  return device.createTexture({
    size: { width: w, height: h },
    format: 'depth24plus',
    sampleCount: SAMPLE_COUNT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

/** Resize canvas pixel buffer to match CSS display size. Recreates all render targets. */
export function resizeGPU(gpu: GPUContext): void {
  const canvas = gpu.canvas;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === h) return;

  canvas.width = w;
  canvas.height = h;

  gpu.depthTexture.destroy();
  gpu.depthTexture = createDepthTexture(gpu.device, w, h);

  gpu.msaaTexture.destroy();
  gpu.msaaTexture = createMSAATexture(gpu.device, w, h);

  gpu.hdrTexture.destroy();
  gpu.hdrTexture = createHDRTexture(gpu.device, w, h);
}

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to request WebGPU adapter');
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get WebGPU canvas context');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });

  const w = canvas.width;
  const h = canvas.height;
  const depthTexture = createDepthTexture(device, w, h);
  const msaaTexture = createMSAATexture(device, w, h);
  const hdrTexture = createHDRTexture(device, w, h);

  return { device, context, format, depthTexture, msaaTexture, hdrTexture, canvas };
}
