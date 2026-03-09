/**
 * DetailSystem: main component for terrain detail billboards (grass, flowers, rocks).
 *
 * Implements RendererPlugin for automatic integration with RenderSystem.
 *
 * Usage:
 *   const ds = go.addComponent(DetailSystem);
 *   ds.addType(config, texture);
 *   ds.addDetail(0, x, y, z);
 */

import { Component } from '@certe/atmos-core';
import {
  createMaterial,
  writeMaterialUniforms,
  MATERIAL_UNIFORM_SIZE,
  RenderSystem,
  getWhiteFallbackTexture,
} from '@certe/atmos-renderer';
import type { RendererPlugin, GPUTextureHandle } from '@certe/atmos-renderer';
import type { DetailPipelineResources } from './detail-pipeline.js';
import type { DetailTypeConfig, DetailInstance } from './types.js';
import { DETAIL_INSTANCE_STRIDE, DEFAULT_DETAIL_TYPE_CONFIG } from './types.js';
import { createDetailPipeline, createCrossBillboardQuad } from './detail-pipeline.js';

/** Draw uniforms: viewProj(64) + cameraPos(16) + windDir(16) + fadeParams(16) = 112 bytes, padded to 128 */
const DRAW_UNIFORM_SIZE = 128;

const _drawData = new Float32Array(DRAW_UNIFORM_SIZE / 4);
const _matData = new Float32Array(MATERIAL_UNIFORM_SIZE / 4);

export type TextureLoaderFn = (path: string, srgb: boolean) => Promise<GPUTextureHandle | null>;

interface TypeData {
  config: DetailTypeConfig;
  texture: GPUTextureHandle;
  instances: DetailInstance[];
  instanceBuffer: GPUBuffer | null;
  dirty: boolean;
  materialBindGroup: GPUBindGroup | null;
  /** Per-frame culled instance buffer (only instances within fadeEnd). */
  culledBuffer: GPUBuffer | null;
  visibleCount: number;
  /** Billboard quad mesh for this type's dimensions. */
  quadVertexBuffer: GPUBuffer;
  quadIndexBuffer: GPUBuffer;
  quadIndexCount: number;
}

export class DetailSystem extends Component implements RendererPlugin {
  windDirection = new Float32Array([1, 0, 0.3]);
  windStrength = 0.3;

  private _device: GPUDevice | null = null;
  private _pipeline: DetailPipelineResources | null = null;
  private _registered = false;
  private _types: TypeData[] = [];
  private _drawBuffers: GPUBuffer[] = [];
  private _drawBindGroups: GPUBindGroup[] = [];
  private _time = 0;
  private _sceneBuffer: GPUBuffer | null = null;
  private _sampler: GPUSampler | null = null;
  private _textureLoader: TextureLoaderFn | null = null;

  /** Per-type texture source paths (for serialization). */
  private _textureSources: string[] = [];

  /** Pending data from deserialization. */
  private _pendingTypeConfigs: DetailTypeConfig[] | null = null;
  private _pendingInstances: DetailInstance[][] | null = null;

  setTextureLoader(loader: TextureLoaderFn): void {
    this._textureLoader = loader;
    for (let i = 0; i < this._textureSources.length; i++) {
      if (this._textureSources[i]) void this._loadAndApplyTexture(i, this._textureSources[i]!);
    }
  }

  get typeCount(): number { return this._types.length; }
  get isInitialized(): boolean { return this._device !== null; }
  get hasPendingConfigs(): boolean { return this._pendingTypeConfigs !== null && this._pendingTypeConfigs.length > 0; }

  private _autoInit(): boolean {
    if (this._device) return true;
    const rs = RenderSystem.current;
    if (!rs || !rs.device) return false;
    this.init(rs.device, createDetailPipeline(rs.device));
    return true;
  }

  init(device: GPUDevice, pipeline: DetailPipelineResources): void {
    this._device = device;
    this._pipeline = pipeline;

    this._sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    if (RenderSystem.current && !this._registered) {
      RenderSystem.current.addRendererPlugin(this);
      this._registered = true;
    }
  }

  addDefaultType(): number {
    if (!this._autoInit()) return -1;
    const config: DetailTypeConfig = {
      ...DEFAULT_DETAIL_TYPE_CONFIG,
      name: `Detail ${this._types.length}`,
    };
    return this.addType(config);
  }

  addType(config: DetailTypeConfig, texture?: GPUTextureHandle): number {
    // Backfill baseColor for configs deserialized from older scenes
    if (!config.baseColor) config.baseColor = [0.3, 0.5, 0.15];
    const device = this._device!;
    const tex = texture ?? getWhiteFallbackTexture(device);

    // Create cross-billboard quad for this type's dimensions
    const quad = createCrossBillboardQuad(config.width, config.height);
    const quadVertexBuffer = device.createBuffer({
      size: quad.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(quadVertexBuffer.getMappedRange()).set(quad.vertices);
    quadVertexBuffer.unmap();

    const quadIndexBuffer = device.createBuffer({
      size: quad.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(quadIndexBuffer.getMappedRange()).set(quad.indices);
    quadIndexBuffer.unmap();

    const idx = this._types.length;
    this._types.push({
      config,
      texture: tex,
      instances: [],
      instanceBuffer: null,
      dirty: true,
      materialBindGroup: null,
      culledBuffer: null,
      visibleCount: 0,
      quadVertexBuffer,
      quadIndexBuffer,
      quadIndexCount: quad.indices.length,
    });

    return idx;
  }

  removeLastType(): void {
    if (this._types.length === 0) return;
    const td = this._types.pop()!;
    td.instanceBuffer?.destroy();
    td.culledBuffer?.destroy();
    td.quadVertexBuffer.destroy();
    td.quadIndexBuffer.destroy();
    this._textureSources.length = this._types.length;
  }

  getTypeConfig(idx: number): DetailTypeConfig | null {
    return this._types[idx]?.config ?? null;
  }

  updateTypeConfig(idx: number, key: keyof DetailTypeConfig, value: unknown): void {
    const td = this._types[idx];
    if (!td || !this._device) return;
    (td.config as unknown as Record<string, unknown>)[key] = value;

    // Recreate quad if dimensions changed
    if (key === 'width' || key === 'height') {
      this._recreateQuad(idx);
    }

    // Invalidate material bind group when base color changes
    if (key === 'baseColor') {
      td.materialBindGroup = null;
    }
  }

  getTypeName(idx: number): string {
    return this._types[idx]?.config.name ?? `Detail ${idx}`;
  }

  private _recreateQuad(idx: number): void {
    const td = this._types[idx];
    if (!td || !this._device) return;
    const device = this._device;

    td.quadVertexBuffer.destroy();
    td.quadIndexBuffer.destroy();

    const quad = createCrossBillboardQuad(td.config.width, td.config.height);
    td.quadVertexBuffer = device.createBuffer({
      size: quad.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(td.quadVertexBuffer.getMappedRange()).set(quad.vertices);
    td.quadVertexBuffer.unmap();

    td.quadIndexBuffer = device.createBuffer({
      size: quad.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(td.quadIndexBuffer.getMappedRange()).set(quad.indices);
    td.quadIndexBuffer.unmap();

    td.quadIndexCount = quad.indices.length;
  }

  // ── Instance management ─────────────────────────────────────────────

  addDetail(typeIdx: number, x: number, y: number, z: number, rotY?: number, scale?: number, colorShift?: number): void {
    const td = this._types[typeIdx];
    if (!td) return;
    td.instances.push({
      x, y, z,
      rotationY: rotY ?? Math.random() * Math.PI * 2,
      scale: scale ?? 1.0,
      colorShift: colorShift ?? (Math.random() * 2 - 1),
    });
    td.dirty = true;
  }

  removeDetailsInRadius(x: number, z: number, radius: number): number {
    let removed = 0;
    const r2 = radius * radius;
    for (const td of this._types) {
      const before = td.instances.length;
      td.instances = td.instances.filter(inst => {
        const dx = inst.x - x;
        const dz = inst.z - z;
        return dx * dx + dz * dz > r2;
      });
      const delta = before - td.instances.length;
      if (delta > 0) {
        removed += delta;
        td.dirty = true;
      }
    }
    return removed;
  }

  clearAllInstances(): void {
    for (const td of this._types) {
      if (td.instances.length > 0) {
        td.instances = [];
        td.dirty = true;
      }
    }
  }

  getInstances(typeIdx: number): readonly DetailInstance[] {
    return this._types[typeIdx]?.instances ?? [];
  }

  setInstances(typeIdx: number, instances: DetailInstance[]): void {
    const td = this._types[typeIdx];
    if (!td) return;
    td.instances = instances;
    td.dirty = true;
  }

  // ── Serialization ───────────────────────────────────────────────────

  getTypeConfigs(): DetailTypeConfig[] {
    if (this._types.length === 0) return this._pendingTypeConfigs ?? [];
    return this._types.map((td) => td.config);
  }

  setTypeConfigs(configs: DetailTypeConfig[]): void {
    this._pendingTypeConfigs = configs;
  }

  getInstancesData(): DetailInstance[][] {
    if (this._types.length === 0) return this._pendingInstances ?? [];
    return this._types.map((td) => [...td.instances]);
  }

  setInstancesData(data: DetailInstance[][]): void {
    if (this._types.length > 0) {
      for (let i = 0; i < data.length; i++) {
        const td = this._types[i];
        if (td && data[i]) {
          td.instances = data[i]!;
          td.dirty = true;
        }
      }
    } else {
      this._pendingInstances = data;
    }
  }

  initFromPendingData(device: GPUDevice, pipeline: DetailPipelineResources): void {
    this.init(device, pipeline);

    const configs = this._pendingTypeConfigs;
    this._pendingTypeConfigs = null;
    if (configs && configs.length > 0) {
      for (const config of configs) {
        this.addType(config);
      }
      this._applyPendingInstances();

      for (let i = 0; i < this._textureSources.length; i++) {
        if (this._textureSources[i]) void this._loadAndApplyTexture(i, this._textureSources[i]!);
      }
    }
  }

  private _applyPendingInstances(): void {
    if (!this._pendingInstances) return;
    for (let i = 0; i < this._pendingInstances.length; i++) {
      const td = this._types[i];
      if (td && this._pendingInstances[i]) {
        td.instances = this._pendingInstances[i]!;
        td.dirty = true;
      }
    }
    this._pendingInstances = null;
  }

  // ── Texture source paths ────────────────────────────────────────────

  getTextureSource(idx: number): string {
    return this._textureSources[idx] ?? '';
  }

  setTextureSource(idx: number, path: string): void {
    this._textureSources[idx] = path;
    void this._loadAndApplyTexture(idx, path);
  }

  private async _loadAndApplyTexture(typeIdx: number, path: string): Promise<void> {
    const td = this._types[typeIdx];
    if (!td || !this._device) return;

    if (!path) {
      td.texture = getWhiteFallbackTexture(this._device);
      td.materialBindGroup = null;
      return;
    }

    if (!this._textureLoader) return;

    const handle = await this._textureLoader(path, true);
    if (!handle) return;

    const current = this._types[typeIdx];
    if (!current || current !== td) return;
    if (this._textureSources[typeIdx] !== path) return;

    td.texture = handle;
    td.materialBindGroup = null;
  }

  // ── RendererPlugin ─────────────────────────────────────────────────

  collect(vpMatrix: Float32Array, cameraEye: Float32Array, sceneBuffer: GPUBuffer): void {
    if (!this.enabled || !this._device || !this._pipeline) return;
    const device = this._device;
    const pipeline = this._pipeline;

    this._sceneBuffer = sceneBuffer;
    this._time += 1 / 60;

    // Shared draw data (viewProj, cameraPos, wind)
    _drawData.set(vpMatrix, 0);            // viewProj: 16 floats
    _drawData[16] = cameraEye[0]!;         // cameraPos.x
    _drawData[17] = cameraEye[1]!;         // cameraPos.y
    _drawData[18] = cameraEye[2]!;         // cameraPos.z
    _drawData[19] = this._time;            // cameraPos.w = time
    _drawData[20] = this.windDirection[0]!; // windDir.x
    _drawData[21] = this.windDirection[1]!; // windDir.y
    _drawData[22] = this.windDirection[2]!; // windDir.z
    _drawData[23] = this.windStrength;      // windDir.w = strength

    // Ensure we have per-type draw buffers
    while (this._drawBuffers.length < this._types.length) {
      const buf = device.createBuffer({
        size: DRAW_UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bg = device.createBindGroup({
        layout: pipeline.drawBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: buf } }],
      });
      this._drawBuffers.push(buf);
      this._drawBindGroups.push(bg);
    }

    // Per-type: write draw uniforms with type-specific fade params, update instance buffers
    for (let ti = 0; ti < this._types.length; ti++) {
      const td = this._types[ti]!;

      // Write per-type fade params
      _drawData[24] = td.config.fadeStart;
      _drawData[25] = td.config.fadeEnd;
      _drawData[26] = td.config.colorVariation;
      _drawData[27] = 0;
      device.queue.writeBuffer(this._drawBuffers[ti]!, 0, _drawData as GPUAllowSharedBufferSource);

      if (td.dirty && td.instances.length > 0) {
        td.instanceBuffer?.destroy();
        const data = new Float32Array(td.instances.length * DETAIL_INSTANCE_STRIDE);
        for (let i = 0; i < td.instances.length; i++) {
          const inst = td.instances[i]!;
          const off = i * DETAIL_INSTANCE_STRIDE;
          data[off] = inst.x;
          data[off + 1] = inst.y;
          data[off + 2] = inst.z;
          data[off + 3] = inst.rotationY;
          data[off + 4] = inst.scale;
          data[off + 5] = inst.colorShift;
          data[off + 6] = 0; // pad
          data[off + 7] = 0; // pad
        }
        td.instanceBuffer = device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
        });
        new Float32Array(td.instanceBuffer.getMappedRange()).set(data);
        td.instanceBuffer.unmap();
        td.dirty = false;
      }

      // Per-frame distance cull: only send instances within fadeEnd to GPU
      const camX = cameraEye[0]!, camY = cameraEye[1]!, camZ = cameraEye[2]!;
      const fadeEnd2 = td.config.fadeEnd * td.config.fadeEnd;
      const culled = new Float32Array(td.instances.length * DETAIL_INSTANCE_STRIDE);
      let visCount = 0;
      for (let i = 0; i < td.instances.length; i++) {
        const inst = td.instances[i]!;
        const dx = inst.x - camX, dy = inst.y - camY, dz = inst.z - camZ;
        if (dx * dx + dy * dy + dz * dz > fadeEnd2) continue;
        const off = visCount * DETAIL_INSTANCE_STRIDE;
        culled[off] = inst.x;
        culled[off + 1] = inst.y;
        culled[off + 2] = inst.z;
        culled[off + 3] = inst.rotationY;
        culled[off + 4] = inst.scale;
        culled[off + 5] = inst.colorShift;
        culled[off + 6] = 0;
        culled[off + 7] = 0;
        visCount++;
      }
      td.visibleCount = visCount;
      td.culledBuffer?.destroy();
      if (visCount > 0) {
        td.culledBuffer = device.createBuffer({
          size: visCount * DETAIL_INSTANCE_STRIDE * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
        });
        new Float32Array(td.culledBuffer.getMappedRange()).set(culled.subarray(0, visCount * DETAIL_INSTANCE_STRIDE));
        td.culledBuffer.unmap();
      } else {
        td.culledBuffer = null;
      }

      if (!td.materialBindGroup && sceneBuffer) {
        this._createMaterialBindGroup(td);
      }
    }
  }

  draw(pass: GPURenderPassEncoder, shadowBindGroup: GPUBindGroup): void {
    if (!this.enabled || !this._pipeline || !this._device) return;
    const pipeline = this._pipeline;

    for (let ti = 0; ti < this._types.length; ti++) {
      const td = this._types[ti]!;
      if (td.visibleCount === 0 || !td.culledBuffer || !td.materialBindGroup) continue;

      pass.setPipeline(pipeline.pipeline);
      pass.setBindGroup(0, this._drawBindGroups[ti]!);
      pass.setBindGroup(1, td.materialBindGroup);
      pass.setBindGroup(2, shadowBindGroup);
      pass.setVertexBuffer(0, td.quadVertexBuffer);
      pass.setVertexBuffer(1, td.culledBuffer);
      pass.setIndexBuffer(td.quadIndexBuffer, 'uint16');
      pass.drawIndexed(td.quadIndexCount, td.visibleCount);
    }
  }

  // No shadow or depth for detail billboards — too lightweight

  // ── Private helpers ────────────────────────────────────────────────

  private _createMaterialBindGroup(td: TypeData): void {
    const device = this._device!;
    const pipeline = this._pipeline!;
    const sceneBuffer = this._sceneBuffer!;

    const bc = td.config.baseColor ?? [1, 1, 1];
    const mat = createMaterial({ albedo: [bc[0], bc[1], bc[2], 1], roughness: 0.9, metallic: 0.0 });
    writeMaterialUniforms(_matData, mat);
    const matBuf = device.createBuffer({
      size: MATERIAL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(matBuf, 0, _matData as GPUAllowSharedBufferSource);

    td.materialBindGroup = device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: matBuf } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: td.texture.view },
        { binding: 3, resource: this._sampler! },
      ],
    });
  }

  onDestroy(): void {
    if (this._registered && RenderSystem.current) {
      RenderSystem.current.removeRendererPlugin(this);
      this._registered = false;
    }
    for (const buf of this._drawBuffers) buf.destroy();
    this._drawBuffers.length = 0;
    this._drawBindGroups.length = 0;
    for (const td of this._types) {
      td.instanceBuffer?.destroy();
      td.culledBuffer?.destroy();
      td.quadVertexBuffer.destroy();
      td.quadIndexBuffer.destroy();
    }
    this._types.length = 0;
  }
}
