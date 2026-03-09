/**
 * TerrainSplatmap: CPU-side RGBA splatmap + GPU texture for terrain texture painting.
 *
 * Each channel (R, G, B, A) represents the weight of a terrain layer (0-3).
 * Weights are normalized so they sum to 1.0 in the shader.
 *
 * Layer albedo + normal textures are packed into texture_2d_array (4 layers each)
 * to stay within the 16-texture-per-stage WebGPU limit.
 *
 * Paint operations modify the CPU buffer, then flush() uploads dirty regions to the GPU.
 */

/** Resolution that all layer textures are resized to when packed into the array. */
export const LAYER_ARRAY_SIZE = 1024;

export interface SplatmapLayer {
  /** Source albedo texture (any size — copied into array at setLayer). */
  albedoSource: GPUTexture | null;
  /** Source normal texture (any size — copied into array at setLayerNormal). */
  normalSource: GPUTexture | null;
  /** Isotropic UV tiling factor. Default 10.0. */
  tiling: number;
}

/** Per-layer tiling uniform: vec4(t0, t1, t2, t3) + vec4(hmWorldSize, 0, 0, 0) = 32B */
export const SPLATMAP_UNIFORM_SIZE = 32;

export class TerrainSplatmap {
  readonly resolution: number;
  readonly worldSize: number;
  /** Raw RGBA data, row-major. Length = resolution * resolution * 4. */
  readonly data: Uint8Array;

  private _texture: GPUTexture;
  private _view: GPUTextureView;
  private _device: GPUDevice;
  private _dirty = false;
  private _dirtyMinX = 0;
  private _dirtyMinZ = 0;
  private _dirtyMaxX = 0;
  private _dirtyMaxZ = 0;

  /** Layer config (up to 4). */
  readonly layers: SplatmapLayer[] = [
    { albedoSource: null, normalSource: null, tiling: 10 },
    { albedoSource: null, normalSource: null, tiling: 10 },
    { albedoSource: null, normalSource: null, tiling: 10 },
    { albedoSource: null, normalSource: null, tiling: 10 },
  ];

  /** 4-layer texture_2d_array for albedo (rgba8unorm, LAYER_ARRAY_SIZE²). */
  private _albedoArray: GPUTexture;
  albedoArrayView: GPUTextureView;

  /** 4-layer texture_2d_array for normals (rgba8unorm, LAYER_ARRAY_SIZE²). */
  private _normalArray: GPUTexture;
  normalArrayView: GPUTextureView;

  /** Whether the array textures need re-binding (layer texture changed). */
  arrayDirty = false;

  /** Uniform buffer for layer tilings. */
  uniformBuffer: GPUBuffer;

  constructor(device: GPUDevice, resolution: number, worldSize: number) {
    this._device = device;
    this.resolution = resolution;
    this.worldSize = worldSize;

    // Init data: layer 0 = full weight (R=255), others 0
    this.data = new Uint8Array(resolution * resolution * 4);
    for (let i = 0; i < resolution * resolution; i++) {
      this.data[i * 4] = 255; // R = layer 0
    }

    this._texture = device.createTexture({
      size: { width: resolution, height: resolution },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this._view = this._texture.createView();

    // Upload initial data
    device.queue.writeTexture(
      { texture: this._texture },
      this.data as GPUAllowSharedBufferSource,
      { bytesPerRow: resolution * 4 },
      { width: resolution, height: resolution },
    );

    // Create array textures (4 layers each)
    this._albedoArray = this._createArrayTexture();
    this.albedoArrayView = this._albedoArray.createView({ dimension: '2d-array' });
    this._normalArray = this._createArrayTexture();
    this.normalArrayView = this._normalArray.createView({ dimension: '2d-array' });

    // Fill albedo array with white, normal array with flat normal (127,127,255)
    this._fillArrayWhite(this._albedoArray);
    this._fillArrayFlatNormal(this._normalArray);

    this.uniformBuffer = device.createBuffer({
      size: SPLATMAP_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._writeUniforms();
  }

  get texture(): GPUTexture { return this._texture; }
  get view(): GPUTextureView { return this._view; }

  /**
   * Set a layer's albedo texture with its tiling.
   * The texture is copied into the array at the given layer index.
   */
  setLayer(index: number, texture: GPUTexture, tiling = 10.0): void {
    if (index < 0 || index > 3) return;
    this.layers[index]!.albedoSource = texture;
    this.layers[index]!.tiling = tiling;
    this._copyTextureIntoArray(texture, this._albedoArray, index);
    this.arrayDirty = true;
    this._writeUniforms();
  }

  /** Set a layer's normal map texture. Copied into the normal array. */
  setLayerNormal(index: number, normalTexture: GPUTexture): void {
    if (index < 0 || index > 3) return;
    this.layers[index]!.normalSource = normalTexture;
    this._copyTextureIntoArray(normalTexture, this._normalArray, index);
    this.arrayDirty = true;
  }

  setLayerTiling(index: number, tiling: number): void {
    if (index < 0 || index > 3) return;
    this.layers[index]!.tiling = tiling;
    this._writeUniforms();
  }

  /**
   * Paint at world position. Applies a circular brush that increases the
   * weight of `layerIndex` and proportionally decreases other layers.
   */
  paint(worldX: number, worldZ: number, radius: number, layerIndex: number, strength: number): void {
    if (layerIndex < 0 || layerIndex > 3) return;

    const res = this.resolution;
    const halfSize = this.worldSize / 2;

    // World -> texel coords
    const centerU = (worldX + halfSize) / this.worldSize * res;
    const centerV = (worldZ + halfSize) / this.worldSize * res;
    const texelRadius = radius / this.worldSize * res;

    const minX = Math.max(0, Math.floor(centerU - texelRadius));
    const maxX = Math.min(res - 1, Math.ceil(centerU + texelRadius));
    const minZ = Math.max(0, Math.floor(centerV - texelRadius));
    const maxZ = Math.min(res - 1, Math.ceil(centerV + texelRadius));

    const r2 = texelRadius * texelRadius;

    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - centerU;
        const dz = z - centerV;
        const dist2 = dx * dx + dz * dz;
        if (dist2 > r2) continue;

        // Smooth circular falloff
        const t = 1.0 - Math.sqrt(dist2) / texelRadius;
        const factor = t * t * strength;

        const idx = (z * res + x) * 4;
        const w0 = this.data[idx]!;
        const w1 = this.data[idx + 1]!;
        const w2 = this.data[idx + 2]!;
        const w3 = this.data[idx + 3]!;
        const weights = [w0, w1, w2, w3];

        // Add to target layer
        const add = factor * 255;
        weights[layerIndex] = Math.min(255, weights[layerIndex]! + add);

        // Normalize so sum = 255
        const sum = weights[0]! + weights[1]! + weights[2]! + weights[3]!;
        if (sum > 0) {
          const scale = 255 / sum;
          this.data[idx] = Math.round(weights[0]! * scale);
          this.data[idx + 1] = Math.round(weights[1]! * scale);
          this.data[idx + 2] = Math.round(weights[2]! * scale);
          this.data[idx + 3] = Math.round(weights[3]! * scale);
        }
      }
    }

    // Track dirty region
    if (!this._dirty) {
      this._dirtyMinX = minX;
      this._dirtyMinZ = minZ;
      this._dirtyMaxX = maxX;
      this._dirtyMaxZ = maxZ;
      this._dirty = true;
    } else {
      this._dirtyMinX = Math.min(this._dirtyMinX, minX);
      this._dirtyMinZ = Math.min(this._dirtyMinZ, minZ);
      this._dirtyMaxX = Math.max(this._dirtyMaxX, maxX);
      this._dirtyMaxZ = Math.max(this._dirtyMaxZ, maxZ);
    }
  }

  /** Upload dirty region to GPU. Call once per frame after painting. */
  flush(): void {
    if (!this._dirty) return;

    const res = this.resolution;
    const x0 = this._dirtyMinX;
    const z0 = this._dirtyMinZ;
    const w = this._dirtyMaxX - x0 + 1;
    const h = this._dirtyMaxZ - z0 + 1;

    // Extract sub-region into a contiguous buffer
    const subData = new Uint8Array(w * h * 4);
    for (let z = 0; z < h; z++) {
      const srcOffset = ((z0 + z) * res + x0) * 4;
      const dstOffset = z * w * 4;
      subData.set(this.data.subarray(srcOffset, srcOffset + w * 4), dstOffset);
    }

    this._device.queue.writeTexture(
      { texture: this._texture, origin: { x: x0, y: z0 } },
      subData as GPUAllowSharedBufferSource,
      { bytesPerRow: w * 4 },
      { width: w, height: h },
    );

    this._dirty = false;
  }

  /** Get raw splatmap data as a serializable buffer. */
  getData(): Uint8Array {
    return new Uint8Array(this.data);
  }

  /** Load splatmap data from a buffer. */
  setData(data: Uint8Array): void {
    if (data.length !== this.data.length) return;
    this.data.set(data);
    this._device.queue.writeTexture(
      { texture: this._texture },
      this.data as GPUAllowSharedBufferSource,
      { bytesPerRow: this.resolution * 4 },
      { width: this.resolution, height: this.resolution },
    );
  }

  destroy(): void {
    this._texture.destroy();
    this._albedoArray.destroy();
    this._normalArray.destroy();
    this.uniformBuffer.destroy();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private _createArrayTexture(): GPUTexture {
    return this._device.createTexture({
      size: { width: LAYER_ARRAY_SIZE, height: LAYER_ARRAY_SIZE, depthOrArrayLayers: 4 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private _fillArrayWhite(arr: GPUTexture): void {
    const size = LAYER_ARRAY_SIZE * LAYER_ARRAY_SIZE * 4;
    const white = new Uint8Array(size);
    white.fill(255);
    for (let layer = 0; layer < 4; layer++) {
      this._device.queue.writeTexture(
        { texture: arr, origin: { x: 0, y: 0, z: layer } },
        white as GPUAllowSharedBufferSource,
        { bytesPerRow: LAYER_ARRAY_SIZE * 4 },
        { width: LAYER_ARRAY_SIZE, height: LAYER_ARRAY_SIZE },
      );
    }
  }

  private _fillArrayFlatNormal(arr: GPUTexture): void {
    const size = LAYER_ARRAY_SIZE * LAYER_ARRAY_SIZE * 4;
    const flat = new Uint8Array(size);
    for (let i = 0; i < LAYER_ARRAY_SIZE * LAYER_ARRAY_SIZE; i++) {
      flat[i * 4] = 127;
      flat[i * 4 + 1] = 127;
      flat[i * 4 + 2] = 255;
      flat[i * 4 + 3] = 255;
    }
    for (let layer = 0; layer < 4; layer++) {
      this._device.queue.writeTexture(
        { texture: arr, origin: { x: 0, y: 0, z: layer } },
        flat as GPUAllowSharedBufferSource,
        { bytesPerRow: LAYER_ARRAY_SIZE * 4 },
        { width: LAYER_ARRAY_SIZE, height: LAYER_ARRAY_SIZE },
      );
    }
  }

  /**
   * Copy a source texture into a layer of an array texture via render pass blit.
   * Always uses a render pass to handle format conversion (srgb→unorm) and resize.
   */
  private _copyTextureIntoArray(src: GPUTexture, arr: GPUTexture, layerIndex: number): void {
    const device = this._device;


    const layerView = arr.createView({
      dimension: '2d',
      baseArrayLayer: layerIndex,
      arrayLayerCount: 1,
    });

    const srcView = src.createView();
    const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });

    const bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const bg = device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: sampler },
      ],
    });

    const module = device.createShaderModule({ code: BLIT_SHADER });
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
    });

    device.pushErrorScope('validation');
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: layerView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    device.popErrorScope().then((error) => {
      if (error) {
        console.error(`[Splatmap] blit error for layer ${layerIndex}:`, error.message);
      }
    });
  }

  private _writeUniforms(): void {
    const d = new Float32Array(SPLATMAP_UNIFORM_SIZE / 4);
    d[0] = this.layers[0]!.tiling;
    d[1] = this.layers[1]!.tiling;
    d[2] = this.layers[2]!.tiling;
    d[3] = this.layers[3]!.tiling;
    d[4] = this.worldSize;
    this._device.queue.writeBuffer(this.uniformBuffer, 0, d as GPUAllowSharedBufferSource);
  }
}

/** Fullscreen triangle blit shader for resizing textures into array layers. */
const BLIT_SHADER = /* wgsl */`
struct BlitParams {
  targetSize: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  let x = f32(i32(vi) / 2) * 4.0 - 1.0;
  let y = f32(i32(vi) % 2) * 4.0 - 1.0;
  return vec4(x, y, 0.0, 1.0);
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = pos.xy / ${LAYER_ARRAY_SIZE}.0;
  return textureSample(srcTex, srcSampler, uv);
}
`;
