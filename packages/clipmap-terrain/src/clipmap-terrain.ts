/**
 * ClipmapTerrain: main component that manages LOD rings, camera snapping,
 * heightmap setup, and per-frame uniform updates.
 *
 * Implements RendererPlugin to integrate with RenderSystem automatically.
 *
 * Usage:
 *   const terrain = go.addComponent(ClipmapTerrain);
 *   terrain.init(device, pipeline, { heightFn: (x,z) => ... });
 */

import { Component, GameObject } from '@certe/atmos-core';
import type { Mat4Type } from '@certe/atmos-math';
import { createMesh, createMaterial, RenderSystem } from '@certe/atmos-renderer';
import type { Mesh, Material, RendererPlugin, GPUTextureHandle } from '@certe/atmos-renderer';
import { ClipmapMeshRenderer } from './clipmap-mesh-renderer.js';
import type { ClipmapPipelineResources } from './clipmap-pipeline.js';
import { createFullGrid, createRingGrid } from './clipmap-grid.js';
import type { ClipmapConfig, HeightFn } from './types.js';
import { DEFAULT_CLIPMAP_CONFIG } from './types.js';
import { TerrainSplatmap } from './terrain-splatmap.js';

export interface ClipmapTerrainOptions {
  /** Procedural height function. Rasterized to an R32Float texture at init. */
  heightFn?: HeightFn;
  /** Pre-made heightmap texture (R32Float). Overrides heightFn. */
  heightmapTexture?: GPUTexture;
  /** Shared material for all rings. Created with defaults if omitted. */
  material?: Material;
  /** Partial config overrides. */
  config?: Partial<ClipmapConfig>;
}

export type TextureLoaderFn = (path: string, srgb: boolean) => Promise<GPUTextureHandle | null>;

export class ClipmapTerrain extends Component implements RendererPlugin {
  config: ClipmapConfig = { ...DEFAULT_CLIPMAP_CONFIG };
  castShadow = true;
  receiveSSAO = true;

  /** Layer texture paths (serialized). Setting triggers async load if loader is set. */
  private _layerAlbedoPaths: (string | null)[] = [null, null, null, null];
  private _layerNormalPaths: (string | null)[] = [null, null, null, null];
  private _layerTilings: number[] = [10, 10, 10, 10];
  private _textureLoader: TextureLoaderFn | null = null;

  /** Material values stored on the component (survive before init / across re-init). */
  private _albedo = new Float32Array([0.4, 0.55, 0.3, 1]);
  private _roughness = 0.85;
  private _metallic = 0.0;

  private _device: GPUDevice | null = null;
  private _pipeline: ClipmapPipelineResources | null = null;
  private _rings: ClipmapMeshRenderer[] = [];
  private _ringObjects: GameObject[] = [];
  private _fullGridMesh: Mesh | null = null;
  private _fullGridMeshUnstitched: Mesh | null = null;
  private _ringGridMesh: Mesh | null = null;
  private _ringGridMeshUnstitched: Mesh | null = null;
  private _heightmapTexture: GPUTexture | null = null;
  private _heightmapView: GPUTextureView | null = null;
  private _material: Material | null = null;
  private _ownsHeightmap = false;
  private _registered = false;
  private _heightFn: HeightFn = () => 0;
  private _splatmap: TerrainSplatmap | null = null;

  init(
    device: GPUDevice,
    pipeline: ClipmapPipelineResources,
    options: ClipmapTerrainOptions = {},
  ): void {
    this._device = device;
    this._pipeline = pipeline;

    if (options.config) {
      Object.assign(this.config, options.config);
    }

    this._material = options.material ?? createMaterial({
      albedo: Array.from(this._albedo) as [number, number, number, number],
      roughness: this._roughness,
      metallic: this._metallic,
    });
    // Always force-sync stored values → material (covers deserialized state)
    this._material.albedo.set(this._albedo);
    this._material.roughness = this._roughness;
    this._material.metallic = this._metallic;
    this._material.dirty = true;

    // Heightmap setup
    const hfn = options.heightFn ?? (() => 0);
    this._heightFn = hfn;
    if (options.heightmapTexture) {
      this._heightmapTexture = options.heightmapTexture;
      this._ownsHeightmap = false;
    } else {
      this._heightmapTexture = this._rasterizeHeightmap(hfn);
      this._ownsHeightmap = true;
    }

    this._heightmapView = this._heightmapTexture.createView();

    // Create grid meshes (stitched + unstitched variants)
    const { gridSize } = this.config;
    const fullGridStitched = createFullGrid(gridSize, true);
    this._fullGridMesh = createMesh(device, fullGridStitched.vertices, fullGridStitched.indices, 2);

    const fullGridUnstitched = createFullGrid(gridSize, false);
    this._fullGridMeshUnstitched = createMesh(device, fullGridUnstitched.vertices, fullGridUnstitched.indices, 2);

    const ringGridStitched = createRingGrid(gridSize, true);
    this._ringGridMesh = createMesh(device, ringGridStitched.vertices, ringGridStitched.indices, 2);

    const ringGridUnstitched = createRingGrid(gridSize, false);
    this._ringGridMeshUnstitched = createMesh(device, ringGridUnstitched.vertices, ringGridUnstitched.indices, 2);

    // Clean up any existing rings — destroy GPU resources and detach children
    for (const ring of this._rings) {
      ring.onDestroy();
    }
    const staleChildren = this.gameObject.children.filter(
      c => c.name.startsWith('clipmap-ring-'),
    );
    for (const go of staleChildren) {
      go.setParent(null);
    }
    this._rings.length = 0;
    this._ringObjects.length = 0;

    // Create splatmap (must be before _createRings so rings get a reference)
    this._splatmap = new TerrainSplatmap(
      device,
      this.config.heightmapResolution,
      this.config.heightmapWorldSize,
    );

    // Create ring components
    this._createRings();

    // Register with RenderSystem
    if (RenderSystem.current && !this._registered) {
      RenderSystem.current.addRendererPlugin(this);
      this._registered = true;
    }
  }

  private _rasterizeHeightmap(heightFn: HeightFn): GPUTexture {
    const device = this._device!;
    const res = this.config.heightmapResolution;
    const worldSize = this.config.heightmapWorldSize;
    const halfSize = worldSize / 2;
    const data = new Float32Array(res * res);

    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const wx = (x / (res - 1)) * worldSize - halfSize;
        const wz = (z / (res - 1)) * worldSize - halfSize;
        data[z * res + x] = heightFn(wx, wz);
      }
    }

    const texture = device.createTexture({
      size: { width: res, height: res },
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: res * 4 },
      { width: res, height: res },
    );

    return texture;
  }

  private _createRings(): void {
    const device = this._device!;
    const pipeline = this._pipeline!;
    const { levels } = this.config;

    const lastLevel = levels - 1;
    for (let i = 0; i < levels; i++) {
      // Outermost level: no stitching (nothing coarser beyond it)
      // All other levels: stitched outer edge to match coarser ring
      const isOutermost = i === lastLevel;
      let mesh: Mesh;
      if (i === 0) {
        mesh = isOutermost ? this._fullGridMeshUnstitched! : this._fullGridMesh!;
      } else {
        mesh = isOutermost ? this._ringGridMeshUnstitched! : this._ringGridMesh!;
      }
      const childGO = new GameObject(`clipmap-ring-${i}`);
      childGO.transient = true; // Don't serialize ring children — they're recreated by init()
      childGO.setParent(this.gameObject);
      // Ring children are added to the scene automatically when the terrain GO
      // is added to a scene (Scene.add recursively adds children).

      const ring = childGO.addComponent(ClipmapMeshRenderer);
      ring.init(device, pipeline, mesh, this._heightmapView!);
      ring.material = this._material;
      ring.level = i;
      ring.castShadow = this.castShadow;
      ring.receiveSSAO = this.receiveSSAO;
      ring.splatmap = this._splatmap;

      this._rings.push(ring);
      this._ringObjects.push(childGO);
    }
  }

  // ── RendererPlugin interface ──────────────────────────────────────

  collect(vpMatrix: Float32Array, cameraEye: Float32Array, sceneBuffer: GPUBuffer): void {
    if (!this.enabled || this._rings.length === 0) return;

    // Flush any pending splatmap paint operations to GPU
    this._splatmap?.flush();

    // Rebuild bind groups if layer textures changed
    if (this._splatmap?.arrayDirty) {
      for (const ring of this._rings) ring.materialBindGroup = null;
      this._splatmap.arrayDirty = false;
    }

    const cameraX = cameraEye[0]!;
    const cameraZ = cameraEye[2]!;
    const { cellSize, gridSize, levels, heightmapResolution, heightmapWorldSize } = this.config;
    const texelSize = heightmapWorldSize / heightmapResolution;

    for (let i = 0; i < levels; i++) {
      const ring = this._rings[i];
      if (!ring) continue;

      const levelCellSize = cellSize * (1 << i);
      const snapSize = levelCellSize * 2;

      const originX = Math.floor(cameraX / snapSize) * snapSize;
      const originZ = Math.floor(cameraZ / snapSize) * snapSize;

      ring.writeLevelUniforms(
        originX, originZ, levelCellSize,
        gridSize, texelSize, heightmapWorldSize,
      );
      ring.initMaterialBindGroup(sceneBuffer);
      ring.writeObjectUniforms(vpMatrix as Mat4Type);
    }
  }

  draw(pass: GPURenderPassEncoder, shadowBindGroup: GPUBindGroup): void {
    if (!this.enabled) return;
    for (const ring of this._rings) {
      ring.draw(pass);
      pass.setBindGroup(2, shadowBindGroup);
    }
  }

  drawShadow(pass: GPURenderPassEncoder): void {
    if (!this.enabled || !this.castShadow || !this._pipeline) return;
    pass.setPipeline(this._pipeline.shadowPipeline);
    for (const ring of this._rings) {
      if (!ring.mesh || !ring.shadowBindGroup) continue;
      pass.setBindGroup(0, ring.shadowBindGroup);
      pass.setVertexBuffer(0, ring.mesh.vertexBuffer);
      pass.setIndexBuffer(ring.mesh.indexBuffer, ring.mesh.indexFormat);
      pass.drawIndexed(ring.mesh.indexCount);
    }
  }

  drawDepth(pass: GPURenderPassEncoder): void {
    // Always draw terrain depth — even when receiveSSAO is false, terrain must
    // occlude objects behind it so their SSAO doesn't bleed through.
    if (!this.enabled || !this._pipeline) return;
    // Re-use shadow pipeline for depth-only prepass
    pass.setPipeline(this._pipeline.shadowPipeline);
    for (const ring of this._rings) {
      if (!ring.mesh || !ring.shadowBindGroup) continue;
      pass.setBindGroup(0, ring.shadowBindGroup);
      pass.setVertexBuffer(0, ring.mesh.vertexBuffer);
      pass.setIndexBuffer(ring.mesh.indexBuffer, ring.mesh.indexFormat);
      pass.drawIndexed(ring.mesh.indexCount);
    }
  }

  drawSSAOErase(pass: GPURenderPassEncoder): void {
    if (!this.enabled || this.receiveSSAO || !this._pipeline) return;
    // Write 1.0 to AO texture for terrain pixels, erasing SSAO effect
    pass.setPipeline(this._pipeline.ssaoErasePipeline);
    for (const ring of this._rings) {
      if (!ring.mesh || !ring.shadowBindGroup) continue;
      pass.setBindGroup(0, ring.shadowBindGroup);
      pass.setVertexBuffer(0, ring.mesh.vertexBuffer);
      pass.setIndexBuffer(ring.mesh.indexBuffer, ring.mesh.indexFormat);
      pass.drawIndexed(ring.mesh.indexCount);
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  get rings(): readonly ClipmapMeshRenderer[] {
    return this._rings;
  }

  get material(): Material | null {
    return this._material;
  }

  set material(m: Material | null) {
    this._material = m;
    for (const ring of this._rings) {
      ring.material = m;
      ring.materialBindGroup = null;
    }
  }

  /** Material albedo color (multiplied with layer textures). Editable from inspector. */
  get albedo(): Float32Array {
    return this._albedo;
  }

  set albedo(v: Float32Array | [number, number, number, number]) {
    this._albedo[0] = v[0]!;
    this._albedo[1] = v[1]!;
    this._albedo[2] = v[2]!;
    this._albedo[3] = v[3] ?? 1;
    if (this._material) {
      this._material.albedo.set(this._albedo);
      this._material.dirty = true;
    }
  }

  get roughness(): number { return this._roughness; }
  set roughness(v: number) {
    this._roughness = v;
    if (this._material) { this._material.roughness = v; this._material.dirty = true; }
  }

  get metallic(): number { return this._metallic; }
  set metallic(v: number) {
    this._metallic = v;
    if (this._material) { this._material.metallic = v; this._material.dirty = true; }
  }

  setHeightmapTexture(texture: GPUTexture): void {
    if (this._ownsHeightmap && this._heightmapTexture) {
      this._heightmapTexture.destroy();
    }
    this._heightmapTexture = texture;
    this._heightmapView = texture.createView();
    this._ownsHeightmap = false;
    this._recreateBindGroups();
  }

  updateHeightmap(heightFn: HeightFn): void {
    this._heightFn = heightFn;
    if (this._ownsHeightmap && this._heightmapTexture) {
      this._heightmapTexture.destroy();
    }
    this._heightmapTexture = this._rasterizeHeightmap(heightFn);
    this._heightmapView = this._heightmapTexture.createView();
    this._ownsHeightmap = true;
    this._recreateBindGroups();
  }

  /** Sample terrain height at world (x, z). */
  getHeightAt(x: number, z: number): number {
    return this._heightFn(x, z);
  }

  /** Get the splatmap (for setting layer textures, etc.). */
  get splatmap(): TerrainSplatmap | null {
    return this._splatmap;
  }

  /**
   * Paint the splatmap at world position.
   * @param worldX World X coordinate
   * @param worldZ World Z coordinate
   * @param radius Brush radius in world units
   * @param layerIndex Layer to paint (0-3)
   * @param strength Brush strength (0-1)
   */
  paint(worldX: number, worldZ: number, radius: number, layerIndex: number, strength: number): void {
    this._splatmap?.paint(worldX, worldZ, radius, layerIndex, strength);
  }

  /** Set a texture for a splatmap layer. */
  setLayerTexture(index: number, texture: GPUTexture, tiling = 10.0): void {
    if (!this._splatmap) return;
    this._splatmap.setLayer(index, texture, tiling);
    // Invalidate material bind groups so they get recreated with new textures
    for (const ring of this._rings) {
      ring.materialBindGroup = null;
    }
  }

  /** Set a normal map for a splatmap layer. */
  setLayerNormal(index: number, normalTexture: GPUTexture): void {
    if (!this._splatmap) return;
    this._splatmap.setLayerNormal(index, normalTexture);
    for (const ring of this._rings) {
      ring.materialBindGroup = null;
    }
  }

  /** Set tiling for a splatmap layer. */
  setLayerTiling(index: number, tiling: number): void {
    this._layerTilings[index] = tiling;
    this._splatmap?.setLayerTiling(index, tiling);
  }

  // ── Texture loader + path-based layer API ──────────────────────

  /** Set the async texture loader (wired from editor or player). */
  setTextureLoader(loader: TextureLoaderFn): void {
    this._textureLoader = loader;
    // Re-load any paths that were set before loader was available
    for (let i = 0; i < 4; i++) {
      if (this._layerAlbedoPaths[i]) void this._loadLayerTexture(i, 'albedo', this._layerAlbedoPaths[i]!);
      if (this._layerNormalPaths[i]) void this._loadLayerTexture(i, 'normal', this._layerNormalPaths[i]!);
    }
  }

  /** Get/set layer albedo texture path. Inspector uses these. */
  get layer0Albedo(): string { return this._layerAlbedoPaths[0] ?? ''; }
  set layer0Albedo(v: string) { this._setLayerPath(0, 'albedo', v); }
  get layer1Albedo(): string { return this._layerAlbedoPaths[1] ?? ''; }
  set layer1Albedo(v: string) { this._setLayerPath(1, 'albedo', v); }
  get layer2Albedo(): string { return this._layerAlbedoPaths[2] ?? ''; }
  set layer2Albedo(v: string) { this._setLayerPath(2, 'albedo', v); }
  get layer3Albedo(): string { return this._layerAlbedoPaths[3] ?? ''; }
  set layer3Albedo(v: string) { this._setLayerPath(3, 'albedo', v); }

  get layer0Normal(): string { return this._layerNormalPaths[0] ?? ''; }
  set layer0Normal(v: string) { this._setLayerPath(0, 'normal', v); }
  get layer1Normal(): string { return this._layerNormalPaths[1] ?? ''; }
  set layer1Normal(v: string) { this._setLayerPath(1, 'normal', v); }
  get layer2Normal(): string { return this._layerNormalPaths[2] ?? ''; }
  set layer2Normal(v: string) { this._setLayerPath(2, 'normal', v); }
  get layer3Normal(): string { return this._layerNormalPaths[3] ?? ''; }
  set layer3Normal(v: string) { this._setLayerPath(3, 'normal', v); }

  get layer0Tiling(): number { return this._layerTilings[0]!; }
  set layer0Tiling(v: number) { this.setLayerTiling(0, v); }
  get layer1Tiling(): number { return this._layerTilings[1]!; }
  set layer1Tiling(v: number) { this.setLayerTiling(1, v); }
  get layer2Tiling(): number { return this._layerTilings[2]!; }
  set layer2Tiling(v: number) { this.setLayerTiling(2, v); }
  get layer3Tiling(): number { return this._layerTilings[3]!; }
  set layer3Tiling(v: number) { this.setLayerTiling(3, v); }

  private _setLayerPath(index: number, type: 'albedo' | 'normal', path: string): void {
    const paths = type === 'albedo' ? this._layerAlbedoPaths : this._layerNormalPaths;
    if (paths[index] === path) return;
    paths[index] = path || null;
    if (path) {
      void this._loadLayerTexture(index, type, path);
    }
  }

  private async _loadLayerTexture(index: number, type: 'albedo' | 'normal', path: string): Promise<void> {
    if (!this._textureLoader) return;
    try {
      const srgb = type === 'albedo';
      const handle = await this._textureLoader(path, srgb);
      if (!handle) return;
      if (type === 'albedo') {
        this.setLayerTexture(index, handle.texture, this._layerTilings[index]!);
      } else {
        this.setLayerNormal(index, handle.texture);
      }
    } catch (err) {
      console.error(`[ClipmapTerrain] _loadLayerTexture: error loading ${type}[${index}] "${path}":`, err);
    }
  }

  private _recreateBindGroups(): void {
    const device = this._device!;
    const pipeline = this._pipeline!;
    for (const ring of this._rings) {
      ring.bindGroup = device.createBindGroup({
        layout: pipeline.objectBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: ring.objectBuffer! } },
          { binding: 1, resource: { buffer: ring.levelBuffer! } },
          { binding: 2, resource: this._heightmapView! },
        ],
      });
      ring.shadowBindGroup = device.createBindGroup({
        layout: pipeline.shadowObjectBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: ring.objectBuffer! } },
          { binding: 1, resource: { buffer: ring.levelBuffer! } },
          { binding: 2, resource: this._heightmapView! },
        ],
      });
    }
  }

  /** True when init() has been called and resources are live. */
  get initialized(): boolean { return this._device !== null && this._splatmap !== null; }

  /**
   * Re-initialize GPU resources using stored property values.
   * Safe to call after onDestroy — works like a fresh init().
   */
  reinit(): void {
    if (!this._device || !this._pipeline) return;
    this.init(this._device, this._pipeline);
  }

  onDestroy(): void {
    // Unregister from RenderSystem
    if (this._registered && RenderSystem.current) {
      RenderSystem.current.removeRendererPlugin(this);
      this._registered = false;
    }

    // Destroy ring components and detach ring children
    for (const ring of this._rings) {
      ring.onDestroy();
    }
    for (const go of this._ringObjects) {
      go.setParent(null);
    }
    this._ringObjects.length = 0;
    this._rings.length = 0;

    if (this._ownsHeightmap && this._heightmapTexture) {
      this._heightmapTexture.destroy();
    }
    this._splatmap?.destroy();
    this._splatmap = null;
    this._fullGridMesh?.vertexBuffer.destroy();
    this._fullGridMesh?.indexBuffer.destroy();
    this._fullGridMeshUnstitched?.vertexBuffer.destroy();
    this._fullGridMeshUnstitched?.indexBuffer.destroy();
    this._ringGridMesh?.vertexBuffer.destroy();
    this._ringGridMesh?.indexBuffer.destroy();
    this._ringGridMeshUnstitched?.vertexBuffer.destroy();
    this._ringGridMeshUnstitched?.indexBuffer.destroy();
  }
}
