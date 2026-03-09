/**
 * TreeSystem: main component that manages tree species, instances, LOD, and rendering.
 *
 * Implements RendererPlugin for automatic integration with RenderSystem.
 *
 * Usage:
 *   const ts = go.addComponent(TreeSystem);
 *   ts.init(device, pipeline);
 *   ts.addSpecies(config, { barkTexture, leafTexture });
 *   ts.addTree(0, x, y, z);
 */

import { Component } from '@certe/atmos-core';
import {
  createMesh,
  createMaterial,
  writeMaterialUniforms,
  MATERIAL_UNIFORM_SIZE,
  RenderSystem,
  getWhiteFallbackTexture,
  getFlatNormalFallback,
} from '@certe/atmos-renderer';
import type { Mesh, Material, RendererPlugin, GPUTextureHandle } from '@certe/atmos-renderer';
import type { TreePipelineResources } from './tree-pipeline.js';
import type { TreeSpeciesConfig, TreeInstance } from './types.js';
import { TREE_VERTEX_STRIDE, INSTANCE_STRIDE, DEFAULT_TREE_SPECIES_CONFIG } from './types.js';
import { expandLSystem } from './lsystem.js';
import { generateTreeMesh } from './tree-generator.js';
import { createBillboardMesh } from './billboard.js';
import { captureTreeBillboard, computeBillboardSizing } from './billboard-capture.js';
import { createTreePipeline } from './tree-pipeline.js';
import { mulberry32 } from './lsystem.js';

/** Draw uniforms: viewProj(64) + cameraPos(16) + windDir(16) = 96 bytes */
const DRAW_UNIFORM_SIZE = 96;

/** Scratch buffers for writing uniforms (zero-alloc). */
const _drawData = new Float32Array(DRAW_UNIFORM_SIZE / 4);
const _matData = new Float32Array(MATERIAL_UNIFORM_SIZE / 4);

export interface SpeciesTextures {
  barkTexture?: GPUTextureHandle;
  leafTexture?: GPUTextureHandle;
  barkNormalTexture?: GPUTextureHandle;
  leafNormalTexture?: GPUTextureHandle;
  billboardTexture?: GPUTextureHandle;
}

interface SpeciesData {
  config: TreeSpeciesConfig;
  meshData: import('./types.js').TreeMeshData; // retained for billboard re-capture
  trunkMesh: Mesh;
  leafMesh: Mesh;
  billboardMesh: Mesh;
  trunkMaterial: Material;
  leafMaterial: Material;
  instances: TreeInstance[];
  instanceBuffer: GPUBuffer | null;
  dirty: boolean;
  barkTexture: GPUTextureHandle;
  leafTexture: GPUTextureHandle;
  barkNormalTexture: GPUTextureHandle;
  leafNormalTexture: GPUTextureHandle;
  billboardTexture: GPUTextureHandle;
  // Bind groups
  trunkMaterialBindGroup: GPUBindGroup | null;
  leafMaterialBindGroup: GPUBindGroup | null;
  billboardMaterialBindGroup: GPUBindGroup | null;
  hasBillboardTexture: boolean;
  // LOD split arrays (reused per frame)
  nearInstances: Float32Array | null;
  farInstances: Float32Array | null;
  nearCount: number;
  farCount: number;
  nearInstanceBuffer: GPUBuffer | null; // cached per frame for shadow/depth reuse
}

export type TextureLoaderFn = (path: string, srgb: boolean) => Promise<GPUTextureHandle | null>;

export class TreeSystem extends Component implements RendererPlugin {
  windDirection = new Float32Array([1, 0, 0.3]);
  windStrength = 0.5;
  castShadow = true;

  private _device: GPUDevice | null = null;
  private _pipeline: TreePipelineResources | null = null;
  private _registered = false;
  private _species: SpeciesData[] = [];
  private _drawBuffer: GPUBuffer | null = null;
  private _drawBindGroup: GPUBindGroup | null = null;
  private _shadowDrawBindGroup: GPUBindGroup | null = null;
  private _time = 0;
  private _sceneBuffer: GPUBuffer | null = null;
  private _sampler: GPUSampler | null = null;
  private _textureLoader: TextureLoaderFn | null = null;

  /** Per-species texture source paths (set from inspector or code). */
  private _barkTextureSources: string[] = [];
  private _leafTextureSources: string[] = [];
  private _barkNormalTextureSources: string[] = [];
  private _leafNormalTextureSources: string[] = [];

  /** Pending instance data from deserialization (applied when species are created). */
  private _pendingInstances: TreeInstance[][] | null = null;

  /** Pending species configs from deserialization (used to reconstruct species). */
  private _pendingSpeciesConfigs: TreeSpeciesConfig[] | null = null;

  /** Set the texture loader callback (called from editor bootstrap). */
  setTextureLoader(loader: TextureLoaderFn): void {
    this._textureLoader = loader;
    // Re-apply any stored texture paths that couldn't load before
    for (let i = 0; i < this._barkTextureSources.length; i++) {
      if (this._barkTextureSources[i]) void this._loadAndApplyTexture(i, 'bark', this._barkTextureSources[i]!);
    }
    for (let i = 0; i < this._leafTextureSources.length; i++) {
      if (this._leafTextureSources[i]) void this._loadAndApplyTexture(i, 'leaf', this._leafTextureSources[i]!);
    }
    for (let i = 0; i < this._barkNormalTextureSources.length; i++) {
      if (this._barkNormalTextureSources[i]) void this._loadAndApplyTexture(i, 'barkNormal', this._barkNormalTextureSources[i]!);
    }
    for (let i = 0; i < this._leafNormalTextureSources.length; i++) {
      if (this._leafNormalTextureSources[i]) void this._loadAndApplyTexture(i, 'leafNormal', this._leafNormalTextureSources[i]!);
    }
  }

  /** Get the species name for a given index (for inspector labels). */
  getSpeciesName(idx: number): string {
    return this._species[idx]?.config.name ?? `Species ${idx}`;
  }

  /** Number of species currently registered. */
  get speciesCount(): number { return this._species.length; }

  /** Whether the system is GPU-initialized. */
  get isInitialized(): boolean { return this._device !== null; }

  /** True when pending species configs exist (during deserialization). */
  get hasPendingConfigs(): boolean { return this._pendingSpeciesConfigs !== null && this._pendingSpeciesConfigs.length > 0; }

  /**
   * Auto-initialize GPU resources if not already done.
   * Uses RenderSystem.current to find the device.
   */
  private _autoInit(): boolean {
    if (this._device) return true;
    const rs = RenderSystem.current;
    if (!rs || !rs.device) return false;
    this.init(rs.device, createTreePipeline(rs.device));
    return true;
  }

  /**
   * Add a new species with default config. Returns the species index, or -1 if not initialized.
   */
  addDefaultSpecies(): number {
    if (!this._autoInit()) return -1;
    const seed = Date.now() + this._species.length * 7;
    const config: TreeSpeciesConfig = {
      ...DEFAULT_TREE_SPECIES_CONFIG,
      name: `Species ${this._species.length}`,
      seed,
    };
    return this.addSpecies(config);
  }

  /**
   * Remove the last species.
   */
  removeLastSpecies(): void {
    if (this._species.length === 0) return;
    const sp = this._species.pop()!;
    sp.instanceBuffer?.destroy();
    this._barkTextureSources.length = this._species.length;
    this._leafTextureSources.length = this._species.length;
    this._barkNormalTextureSources.length = this._species.length;
    this._leafNormalTextureSources.length = this._species.length;
  }

  /**
   * Get species config for inspector editing.
   */
  getSpeciesConfig(idx: number): TreeSpeciesConfig | null {
    return this._species[idx]?.config ?? null;
  }

  /**
   * Update a species config property and regenerate the mesh.
   */
  updateSpeciesConfig(idx: number, key: keyof TreeSpeciesConfig, value: unknown): void {
    const sp = this._species[idx];
    if (!sp || !this._device) return;
    (sp.config as unknown as Record<string, unknown>)[key] = value;
    this._regenerateSpeciesMesh(idx);
  }

  /**
   * Regenerate mesh for a species after config change.
   */
  private _regenerateSpeciesMesh(idx: number): void {
    const sp = this._species[idx];
    if (!sp || !this._device) return;
    const device = this._device;
    const config = sp.config;

    // Regenerate L-system and mesh
    const lsystemStr = expandLSystem(config.axiom, config.rules, config.iterations, config.seed);
    const meshData = generateTreeMesh(lsystemStr, config);
    sp.meshData = meshData;

    // Recreate GPU meshes
    sp.trunkMesh = createMesh(device, meshData.trunkVertices, meshData.trunkIndices, TREE_VERTEX_STRIDE);
    sp.leafMesh = createMesh(device, meshData.leafVertices, meshData.leafIndices, TREE_VERTEX_STRIDE);

    // Recompute billboard — dimensions must match the capture's square ortho projection
    const bbSizing = computeBillboardSizing(meshData);
    const bbData = createBillboardMesh(bbSizing.dim, bbSizing.dim, bbSizing.yOffset, bbSizing.centerX);
    sp.billboardMesh = createMesh(device, bbData.vertices, bbData.indices, TREE_VERTEX_STRIDE);

    // Re-capture billboard
    const ta = sp.trunkMaterial.albedo;
    const la = sp.leafMaterial.albedo;
    sp.billboardTexture = captureTreeBillboard(device, meshData, {
      leafTexture: sp.leafTexture.texture ? sp.leafTexture : null,
      trunkColor: [ta[0]!, ta[1]!, ta[2]!, ta[3]!],
      leafColor: [la[0]!, la[1]!, la[2]!, la[3]!],
    });
    sp.hasBillboardTexture = true;

    // Invalidate bind groups & mark instances dirty for re-upload
    sp.trunkMaterialBindGroup = null;
    sp.leafMaterialBindGroup = null;
    sp.billboardMaterialBindGroup = null;
    sp.dirty = true;
  }

  init(device: GPUDevice, pipeline: TreePipelineResources): void {
    this._device = device;
    this._pipeline = pipeline;

    this._drawBuffer = device.createBuffer({
      size: DRAW_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._drawBindGroup = device.createBindGroup({
      layout: pipeline.drawBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._drawBuffer } }],
    });

    this._shadowDrawBindGroup = device.createBindGroup({
      layout: pipeline.shadowDrawBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._drawBuffer } }],
    });

    this._sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });

    if (RenderSystem.current && !this._registered) {
      RenderSystem.current.addRendererPlugin(this);
      this._registered = true;
    }
  }

  /**
   * Add a tree species. Returns the species index.
   */
  addSpecies(config: TreeSpeciesConfig, textures?: SpeciesTextures): number {
    const device = this._device!;

    // Generate tree mesh from L-system
    const lsystemStr = expandLSystem(config.axiom, config.rules, config.iterations, config.seed);
    const meshData = generateTreeMesh(lsystemStr, config);

    const trunkMesh = createMesh(device, meshData.trunkVertices, meshData.trunkIndices, TREE_VERTEX_STRIDE);
    const leafMesh = createMesh(device, meshData.leafVertices, meshData.leafIndices, TREE_VERTEX_STRIDE);

    // Billboard — dimensions must match the capture's square ortho projection
    const bbSizing = computeBillboardSizing(meshData);
    const bbData = createBillboardMesh(bbSizing.dim, bbSizing.dim, bbSizing.yOffset, bbSizing.centerX);
    const billboardMesh = createMesh(device, bbData.vertices, bbData.indices, TREE_VERTEX_STRIDE);

    // Materials
    const trunkMaterial = createMaterial({ albedo: [0.45, 0.3, 0.15, 1], roughness: 0.9, metallic: 0.0 });
    const leafMaterial = createMaterial({ albedo: [0.3, 0.6, 0.2, 1], roughness: 0.8, metallic: 0.0 });

    const whiteTex = getWhiteFallbackTexture(device);
    const flatNormal = getFlatNormalFallback(device);
    const barkTex = textures?.barkTexture ?? whiteTex;
    const leafTex = textures?.leafTexture ?? whiteTex;
    const barkNormalTex = textures?.barkNormalTexture ?? flatNormal;
    const leafNormalTex = textures?.leafNormalTexture ?? flatNormal;

    // Auto-capture billboard if no explicit billboard texture provided
    let bbTex: GPUTextureHandle;
    let hasBillboard: boolean;
    if (textures?.billboardTexture) {
      bbTex = textures.billboardTexture;
      hasBillboard = true;
    } else {
      const ta = trunkMaterial.albedo;
      const la = leafMaterial.albedo;
      bbTex = captureTreeBillboard(device, meshData, {
        leafTexture: textures?.leafTexture ?? null,
        trunkColor: [ta[0]!, ta[1]!, ta[2]!, ta[3]!],
        leafColor: [la[0]!, la[1]!, la[2]!, la[3]!],
      });
      hasBillboard = true;
    }

    const idx = this._species.length;
    this._species.push({
      config,
      meshData,
      trunkMesh,
      leafMesh,
      billboardMesh,
      trunkMaterial,
      leafMaterial,
      instances: [],
      instanceBuffer: null,
      dirty: true,
      barkTexture: barkTex,
      leafTexture: leafTex,
      barkNormalTexture: barkNormalTex,
      leafNormalTexture: leafNormalTex,
      billboardTexture: bbTex,
      trunkMaterialBindGroup: null,
      leafMaterialBindGroup: null,
      billboardMaterialBindGroup: null,
      hasBillboardTexture: hasBillboard,
      nearInstances: null,
      farInstances: null,
      nearCount: 0,
      farCount: 0,
      nearInstanceBuffer: null,
    });

    // Create material bind groups lazily (needs sceneBuffer)
    return idx;
  }

  /**
   * Add a tree instance of the given species.
   */
  addTree(speciesIdx: number, x: number, y: number, z: number, rotY?: number, scale?: number): void {
    const sp = this._species[speciesIdx];
    if (!sp) return;

    const rand = mulberry32(Math.floor(x * 1000 + z * 7919));
    sp.instances.push({
      x, y, z,
      rotationY: rotY ?? rand() * Math.PI * 2,
      scale: scale ?? 1.0,
      windPhase: rand() * Math.PI * 2,
    });
    sp.dirty = true;
  }

  /**
   * Remove all trees within radius of (x, z). Returns count removed.
   */
  removeTreesInRadius(x: number, z: number, radius: number): number {
    let removed = 0;
    const r2 = radius * radius;
    for (const sp of this._species) {
      const before = sp.instances.length;
      sp.instances = sp.instances.filter(inst => {
        const dx = inst.x - x;
        const dz = inst.z - z;
        return dx * dx + dz * dz > r2;
      });
      const delta = before - sp.instances.length;
      if (delta > 0) {
        removed += delta;
        sp.dirty = true;
      }
    }
    return removed;
  }

  /** Remove all tree instances from all species. */
  clearAllInstances(): void {
    for (const sp of this._species) {
      if (sp.instances.length > 0) {
        sp.instances = [];
        sp.dirty = true;
      }
    }
  }

  getInstances(speciesIdx: number): readonly TreeInstance[] {
    return this._species[speciesIdx]?.instances ?? [];
  }

  setInstances(speciesIdx: number, instances: TreeInstance[]): void {
    const sp = this._species[speciesIdx];
    if (!sp) return;
    sp.instances = instances;
    sp.dirty = true;
  }

  // ── Species + instance data serialization ────────────────────────────

  /** Get all species configs for serialization. */
  getSpeciesConfigs(): TreeSpeciesConfig[] {
    if (this._species.length === 0) return this._pendingSpeciesConfigs ?? [];
    return this._species.map((sp) => sp.config);
  }

  /** Set species configs from deserialization. Stored as pending until initFromData() is called. */
  setSpeciesConfigs(configs: TreeSpeciesConfig[]): void {
    this._pendingSpeciesConfigs = configs;
  }

  /**
   * Initialize TreeSystem from pending serialized data (species + instances + textures).
   * Called by the editor deserialize context when device + pipeline are available.
   */
  initFromPendingData(device: GPUDevice, pipeline: TreePipelineResources): void {
    this.init(device, pipeline);

    const configs = this._pendingSpeciesConfigs;
    this._pendingSpeciesConfigs = null;
    if (configs && configs.length > 0) {
      for (const config of configs) {
        this.addSpecies(config);
      }

      this.applyPendingInstances();

      // Re-apply stored texture paths now that species exist
      for (let i = 0; i < this._barkTextureSources.length; i++) {
        if (this._barkTextureSources[i]) void this._loadAndApplyTexture(i, 'bark', this._barkTextureSources[i]!);
      }
      for (let i = 0; i < this._leafTextureSources.length; i++) {
        if (this._leafTextureSources[i]) void this._loadAndApplyTexture(i, 'leaf', this._leafTextureSources[i]!);
      }
      for (let i = 0; i < this._barkNormalTextureSources.length; i++) {
        if (this._barkNormalTextureSources[i]) void this._loadAndApplyTexture(i, 'barkNormal', this._barkNormalTextureSources[i]!);
      }
      for (let i = 0; i < this._leafNormalTextureSources.length; i++) {
        if (this._leafNormalTextureSources[i]) void this._loadAndApplyTexture(i, 'leafNormal', this._leafNormalTextureSources[i]!);
      }
    }
  }

  /** Get all instance data for serialization. Returns array-per-species. */
  getInstancesData(): TreeInstance[][] {
    if (this._species.length === 0) {
      // Not yet initialized — return pending data if available
      return this._pendingInstances ?? [];
    }
    return this._species.map((sp) => [...sp.instances]);
  }

  /** Set instance data (from deserialization). If species exist, apply immediately. Otherwise store as pending. */
  setInstancesData(data: TreeInstance[][]): void {
    if (this._species.length > 0) {
      // Species already exist — apply directly
      for (let i = 0; i < data.length; i++) {
        const sp = this._species[i];
        if (sp && data[i]) {
          sp.instances = data[i]!;
          sp.dirty = true;
        }
      }
    } else {
      // Store for later — applied when species are created
      this._pendingInstances = data;
    }
  }

  /** Apply pending instance data after species have been added. Called by init code. */
  applyPendingInstances(): void {
    if (!this._pendingInstances) return;
    for (let i = 0; i < this._pendingInstances.length; i++) {
      const sp = this._species[i];
      if (sp && this._pendingInstances[i]) {
        sp.instances = this._pendingInstances[i]!;
        sp.dirty = true;
      }
    }
    this._pendingInstances = null;
  }

  // ── Per-species texture source paths ────────────────────────────────

  getBarkTextureSource(idx: number): string {
    return this._barkTextureSources[idx] ?? '';
  }

  getLeafTextureSource(idx: number): string {
    return this._leafTextureSources[idx] ?? '';
  }

  setBarkTextureSource(idx: number, path: string): void {
    this._barkTextureSources[idx] = path;
    void this._loadAndApplyTexture(idx, 'bark', path);
  }

  setLeafTextureSource(idx: number, path: string): void {
    this._leafTextureSources[idx] = path;
    void this._loadAndApplyTexture(idx, 'leaf', path);
  }

  getBarkNormalTextureSource(idx: number): string {
    return this._barkNormalTextureSources[idx] ?? '';
  }

  getLeafNormalTextureSource(idx: number): string {
    return this._leafNormalTextureSources[idx] ?? '';
  }

  setBarkNormalTextureSource(idx: number, path: string): void {
    this._barkNormalTextureSources[idx] = path;
    void this._loadAndApplyTexture(idx, 'barkNormal', path);
  }

  setLeafNormalTextureSource(idx: number, path: string): void {
    this._leafNormalTextureSources[idx] = path;
    void this._loadAndApplyTexture(idx, 'leafNormal', path);
  }

  private async _loadAndApplyTexture(speciesIdx: number, kind: 'bark' | 'leaf' | 'barkNormal' | 'leafNormal', path: string): Promise<void> {
    const sp = this._species[speciesIdx];
    if (!sp || !this._device) return;

    if (!path) {
      // Clear to fallback
      if (kind === 'bark') sp.barkTexture = getWhiteFallbackTexture(this._device);
      else if (kind === 'leaf') sp.leafTexture = getWhiteFallbackTexture(this._device);
      else if (kind === 'barkNormal') sp.barkNormalTexture = getFlatNormalFallback(this._device);
      else sp.leafNormalTexture = getFlatNormalFallback(this._device);
      sp.trunkMaterialBindGroup = null;
      sp.leafMaterialBindGroup = null;
      return;
    }

    if (!this._textureLoader) return;

    // Normal maps are linear (not sRGB)
    const srgb = kind === 'bark' || kind === 'leaf';
    const handle = await this._textureLoader(path, srgb);
    if (!handle) return;

    // Verify species still exists and path hasn't changed since async load
    const current = this._species[speciesIdx];
    if (!current || current !== sp) return;
    const sourceMap: Record<string, string[]> = {
      bark: this._barkTextureSources,
      leaf: this._leafTextureSources,
      barkNormal: this._barkNormalTextureSources,
      leafNormal: this._leafNormalTextureSources,
    };
    if (sourceMap[kind]![speciesIdx] !== path) return;

    if (kind === 'bark') {
      sp.barkTexture = handle;
    } else if (kind === 'leaf') {
      sp.leafTexture = handle;
      // Re-capture billboard with the actual leaf texture
      if (this._device) {
        const ta = sp.trunkMaterial.albedo;
        const la = sp.leafMaterial.albedo;
        sp.billboardTexture = captureTreeBillboard(this._device, sp.meshData, {
          leafTexture: handle,
          trunkColor: [ta[0]!, ta[1]!, ta[2]!, ta[3]!],
          leafColor: [la[0]!, la[1]!, la[2]!, la[3]!],
        });
        sp.hasBillboardTexture = true;
      }
    } else if (kind === 'barkNormal') {
      sp.barkNormalTexture = handle;
    } else {
      sp.leafNormalTexture = handle;
    }

    // Invalidate bind groups to rebuild with new texture
    sp.trunkMaterialBindGroup = null;
    sp.leafMaterialBindGroup = null;
    sp.billboardMaterialBindGroup = null;
  }

  // ── RendererPlugin ─────────────────────────────────────────────────

  collect(vpMatrix: Float32Array, cameraEye: Float32Array, sceneBuffer: GPUBuffer): void {
    if (!this.enabled || !this._device || !this._pipeline) return;
    const device = this._device;

    this._sceneBuffer = sceneBuffer;
    this._time += 1 / 60; // Approximate time increment

    // Write draw uniforms
    _drawData.set(vpMatrix, 0);            // viewProj: 16 floats
    _drawData[16] = cameraEye[0]!;         // cameraPos.x
    _drawData[17] = cameraEye[1]!;         // cameraPos.y
    _drawData[18] = cameraEye[2]!;         // cameraPos.z
    _drawData[19] = this._time;            // cameraPos.w = time
    _drawData[20] = this.windDirection[0]!; // windDir.x
    _drawData[21] = this.windDirection[1]!; // windDir.y
    _drawData[22] = this.windDirection[2]!; // windDir.z
    _drawData[23] = this.windStrength;      // windDir.w = strength
    device.queue.writeBuffer(this._drawBuffer!, 0, _drawData as GPUAllowSharedBufferSource);

    // Update instance buffers and LOD splits for each species
    const camX = cameraEye[0]!;
    const camY = cameraEye[1]!;
    const camZ = cameraEye[2]!;

    for (const sp of this._species) {
      // Re-create instance buffer if dirty
      if (sp.dirty && sp.instances.length > 0) {
        sp.instanceBuffer?.destroy();
        const data = new Float32Array(sp.instances.length * INSTANCE_STRIDE);
        for (let i = 0; i < sp.instances.length; i++) {
          const inst = sp.instances[i]!;
          const off = i * INSTANCE_STRIDE;
          data[off] = inst.x;
          data[off + 1] = inst.y;
          data[off + 2] = inst.z;
          data[off + 3] = inst.rotationY;
          data[off + 4] = inst.scale;
          data[off + 5] = inst.windPhase;
          data[off + 6] = 0; // pad
          data[off + 7] = 0; // pad
        }
        sp.instanceBuffer = device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
        });
        new Float32Array(sp.instanceBuffer.getMappedRange()).set(data);
        sp.instanceBuffer.unmap();
        sp.dirty = false;
      }

      // Ensure material bind groups exist
      if (!sp.trunkMaterialBindGroup && sceneBuffer) {
        this._createMaterialBindGroups(sp);
      }

      // LOD split: near vs far instances (skip LOD if no billboard texture)
      if (!sp.hasBillboardTexture) {
        // No billboard — all instances render as full mesh
        sp.nearCount = sp.instances.length;
        sp.farCount = 0;
        sp.nearInstances = null; // use instanceBuffer directly
      } else {
        const lodDist2 = sp.config.lodDistance * sp.config.lodDistance;
        const maxDraw = sp.config.drawDistance > 0
          ? sp.config.drawDistance
          : sp.config.lodDistance * 4;
        const maxDraw2 = maxDraw * maxDraw;
        let nearCount = 0;
        let farCount = 0;

        const maxInst = sp.instances.length;
        if (!sp.nearInstances || sp.nearInstances.length < maxInst * INSTANCE_STRIDE) {
          sp.nearInstances = new Float32Array(maxInst * INSTANCE_STRIDE);
          sp.farInstances = new Float32Array(maxInst * INSTANCE_STRIDE);
        }

        for (let i = 0; i < sp.instances.length; i++) {
          const inst = sp.instances[i]!;
          const dx = inst.x - camX;
          const dy = inst.y - camY;
          const dz = inst.z - camZ;
          const dist2 = dx * dx + dy * dy + dz * dz;

          // Cull beyond max draw distance
          if (dist2 > maxDraw2) continue;

          const target = dist2 < lodDist2 ? sp.nearInstances! : sp.farInstances!;
          const count = dist2 < lodDist2 ? nearCount : farCount;
          const off = count * INSTANCE_STRIDE;
          target[off] = inst.x;
          target[off + 1] = inst.y;
          target[off + 2] = inst.z;
          target[off + 3] = inst.rotationY;
          target[off + 4] = inst.scale;
          target[off + 5] = inst.windPhase;
          target[off + 6] = 0;
          target[off + 7] = 0;

          if (dist2 < lodDist2) nearCount++; else farCount++;
        }

        sp.nearCount = nearCount;
        sp.farCount = farCount;
      }

      // Upload near/far instance buffers so drawShadow/drawDepth (which run
      // before draw) have the correct data.
      if (sp.nearInstances && sp.nearCount > 0) {
        sp.nearInstanceBuffer = this._createTempInstanceBuffer(device, sp.nearInstances, sp.nearCount);
      } else if (!sp.nearInstances && sp.nearCount > 0) {
        // No LOD split — use the full instanceBuffer
        sp.nearInstanceBuffer = sp.instanceBuffer;
      } else {
        sp.nearInstanceBuffer = null;
      }
    }
  }

  draw(pass: GPURenderPassEncoder, shadowBindGroup: GPUBindGroup): void {
    if (!this.enabled || !this._pipeline || !this._drawBindGroup) return;
    const pipeline = this._pipeline;
    const device = this._device!;

    for (const sp of this._species) {
      if (sp.instances.length === 0) continue;

      // Near instances: draw trunk + leaves with full mesh
      if (sp.nearCount > 0 && sp.nearInstanceBuffer) {
        const nearBuf = sp.nearInstanceBuffer;

        // Trunk draw
        pass.setPipeline(pipeline.trunkPipeline);
        pass.setBindGroup(0, this._drawBindGroup);
        pass.setBindGroup(1, sp.trunkMaterialBindGroup!);
        pass.setBindGroup(2, shadowBindGroup);
        pass.setVertexBuffer(0, sp.trunkMesh.vertexBuffer);
        pass.setVertexBuffer(1, nearBuf);
        pass.setIndexBuffer(sp.trunkMesh.indexBuffer, sp.trunkMesh.indexFormat);
        pass.drawIndexed(sp.trunkMesh.indexCount, sp.nearCount);

        // Leaf draw
        if (sp.leafMesh.indexCount > 0) {
          pass.setPipeline(pipeline.leafPipeline);
          pass.setBindGroup(0, this._drawBindGroup);
          pass.setBindGroup(1, sp.leafMaterialBindGroup!);
          pass.setBindGroup(2, shadowBindGroup);
          pass.setVertexBuffer(0, sp.leafMesh.vertexBuffer);
          pass.setVertexBuffer(1, nearBuf);
          pass.setIndexBuffer(sp.leafMesh.indexBuffer, sp.leafMesh.indexFormat);
          pass.drawIndexed(sp.leafMesh.indexCount, sp.nearCount);
        }
      }

      // Far instances: draw billboard
      if (sp.farCount > 0 && sp.farInstances) {
        const farBuf = this._createTempInstanceBuffer(device, sp.farInstances, sp.farCount);

        pass.setPipeline(pipeline.billboardPipeline);
        pass.setBindGroup(0, this._drawBindGroup);
        pass.setBindGroup(1, sp.billboardMaterialBindGroup!);
        pass.setBindGroup(2, shadowBindGroup);
        pass.setVertexBuffer(0, sp.billboardMesh.vertexBuffer);
        pass.setVertexBuffer(1, farBuf);
        pass.setIndexBuffer(sp.billboardMesh.indexBuffer, sp.billboardMesh.indexFormat);
        pass.drawIndexed(sp.billboardMesh.indexCount, sp.farCount);
      }
    }
  }

  drawShadow(pass: GPURenderPassEncoder): void {
    if (!this.enabled || !this.castShadow || !this._pipeline || !this._shadowDrawBindGroup) return;
    const pipeline = this._pipeline;

    for (const sp of this._species) {
      // Only cast shadows for near (full-mesh) instances — billboards don't shadow
      if (sp.nearCount === 0 || !sp.nearInstanceBuffer) continue;

      pass.setPipeline(pipeline.trunkShadowPipeline);
      pass.setBindGroup(0, this._shadowDrawBindGroup);
      pass.setVertexBuffer(0, sp.trunkMesh.vertexBuffer);
      pass.setVertexBuffer(1, sp.nearInstanceBuffer);
      pass.setIndexBuffer(sp.trunkMesh.indexBuffer, sp.trunkMesh.indexFormat);
      pass.drawIndexed(sp.trunkMesh.indexCount, sp.nearCount);

      // Leaf shadows
      if (sp.leafMesh.indexCount > 0) {
        pass.setPipeline(pipeline.leafShadowPipeline);
        pass.setBindGroup(0, this._shadowDrawBindGroup);
        pass.setVertexBuffer(0, sp.leafMesh.vertexBuffer);
        pass.setVertexBuffer(1, sp.nearInstanceBuffer);
        pass.setIndexBuffer(sp.leafMesh.indexBuffer, sp.leafMesh.indexFormat);
        pass.drawIndexed(sp.leafMesh.indexCount, sp.nearCount);
      }
    }
  }

  drawDepth(pass: GPURenderPassEncoder): void {
    // Only draw trunks in depth prepass — leaves are alpha-tested and
    // would cause SSAO artifacts around quad edges.
    // Only near instances — billboards skip depth/SSAO.
    if (!this.enabled || !this._pipeline || !this._shadowDrawBindGroup) return;
    const pipeline = this._pipeline;

    for (const sp of this._species) {
      if (sp.nearCount === 0 || !sp.nearInstanceBuffer) continue;

      pass.setPipeline(pipeline.trunkShadowPipeline);
      pass.setBindGroup(0, this._shadowDrawBindGroup);
      pass.setVertexBuffer(0, sp.trunkMesh.vertexBuffer);
      pass.setVertexBuffer(1, sp.nearInstanceBuffer);
      pass.setIndexBuffer(sp.trunkMesh.indexBuffer, sp.trunkMesh.indexFormat);
      pass.drawIndexed(sp.trunkMesh.indexCount, sp.nearCount);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  private _createMaterialBindGroups(sp: SpeciesData): void {
    const device = this._device!;
    const pipeline = this._pipeline!;
    const sceneBuffer = this._sceneBuffer!;

    // Create material UBO
    const trunkMatBuf = this._createMaterialBuffer(device, sp.trunkMaterial);
    const leafMatBuf = this._createMaterialBuffer(device, sp.leafMaterial);

    const flatNormal = getFlatNormalFallback(device);

    sp.trunkMaterialBindGroup = device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: trunkMatBuf } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: sp.barkTexture.view },
        { binding: 3, resource: this._sampler! },
        { binding: 4, resource: sp.barkNormalTexture.view },
        { binding: 5, resource: this._sampler! },
      ],
    });

    sp.leafMaterialBindGroup = device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: leafMatBuf } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: sp.leafTexture.view },
        { binding: 3, resource: this._sampler! },
        { binding: 4, resource: sp.leafNormalTexture.view },
        { binding: 5, resource: this._sampler! },
      ],
    });

    // Billboard uses white albedo + flat normal — the captured texture already has baked colors
    const bbMatBuf = this._createMaterialBuffer(device, createMaterial({ albedo: [1, 1, 1, 1], roughness: 0.8, metallic: 0.0 }));
    sp.billboardMaterialBindGroup = device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: bbMatBuf } },
        { binding: 1, resource: { buffer: sceneBuffer } },
        { binding: 2, resource: sp.billboardTexture.view },
        { binding: 3, resource: this._sampler! },
        { binding: 4, resource: flatNormal.view },
        { binding: 5, resource: this._sampler! },
      ],
    });
  }

  private _createMaterialBuffer(device: GPUDevice, mat: Material): GPUBuffer {
    writeMaterialUniforms(_matData, mat);
    const buf = device.createBuffer({
      size: MATERIAL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, _matData as GPUAllowSharedBufferSource);
    return buf;
  }

  private _createTempInstanceBuffer(device: GPUDevice, data: Float32Array, count: number): GPUBuffer {
    const byteLength = count * INSTANCE_STRIDE * 4;
    const buf = device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(buf.getMappedRange()).set(data.subarray(0, count * INSTANCE_STRIDE));
    buf.unmap();
    return buf;
  }

  onDestroy(): void {
    if (this._registered && RenderSystem.current) {
      RenderSystem.current.removeRendererPlugin(this);
      this._registered = false;
    }
    this._drawBuffer?.destroy();
    for (const sp of this._species) {
      sp.instanceBuffer?.destroy();
      sp.trunkMesh.vertexBuffer.destroy();
      sp.trunkMesh.indexBuffer.destroy();
      sp.leafMesh.vertexBuffer.destroy();
      sp.leafMesh.indexBuffer.destroy();
      sp.billboardMesh.vertexBuffer.destroy();
      sp.billboardMesh.indexBuffer.destroy();
    }
    this._species.length = 0;
  }
}
