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

import { Component, GameObject, Scene } from '@certe/atmos-core';
import type { Mat4Type } from '@certe/atmos-math';
import { createMesh, createMaterial, RenderSystem } from '@certe/atmos-renderer';
import type { Mesh, Material, RendererPlugin } from '@certe/atmos-renderer';
import { ClipmapMeshRenderer } from './clipmap-mesh-renderer.js';
import type { ClipmapPipelineResources } from './clipmap-pipeline.js';
import { createFullGrid, createRingGrid } from './clipmap-grid.js';
import type { ClipmapConfig, HeightFn } from './types.js';
import { DEFAULT_CLIPMAP_CONFIG } from './types.js';

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

export class ClipmapTerrain extends Component implements RendererPlugin {
  config: ClipmapConfig = { ...DEFAULT_CLIPMAP_CONFIG };
  castShadow = true;
  receiveSSAO = true;

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
  private _scene: Scene | null = null;

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
      albedo: [0.4, 0.55, 0.3, 1],
      roughness: 0.85,
      metallic: 0.0,
    });

    // Heightmap setup
    if (options.heightmapTexture) {
      this._heightmapTexture = options.heightmapTexture;
      this._ownsHeightmap = false;
    } else {
      this._heightmapTexture = this._rasterizeHeightmap(options.heightFn ?? (() => 0));
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

    this._scene = Scene.current;

    // Clean up any existing ring children (including deserialized ones
    // whose references aren't in _ringObjects after a fresh deserialize)
    const staleChildren = this.gameObject.children.filter(
      c => c.name.startsWith('clipmap-ring-'),
    );
    for (const go of staleChildren) {
      go.setParent(null);
      this._scene?.remove(go);
    }
    this._rings.length = 0;
    this._ringObjects.length = 0;

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
      childGO.setParent(this.gameObject);
      this._scene?.add(childGO);

      const ring = childGO.addComponent(ClipmapMeshRenderer);
      ring.init(device, pipeline, mesh, this._heightmapView!);
      ring.material = this._material;
      ring.level = i;
      ring.castShadow = this.castShadow;
      ring.receiveSSAO = this.receiveSSAO;

      this._rings.push(ring);
      this._ringObjects.push(childGO);
    }
  }

  // ── RendererPlugin interface ──────────────────────────────────────

  collect(vpMatrix: Float32Array, cameraEye: Float32Array, sceneBuffer: GPUBuffer): void {
    if (!this.enabled || this._rings.length === 0) return;

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
    if (!this.enabled || !this.receiveSSAO || !this._pipeline) return;
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
    if (this._ownsHeightmap && this._heightmapTexture) {
      this._heightmapTexture.destroy();
    }
    this._heightmapTexture = this._rasterizeHeightmap(heightFn);
    this._heightmapView = this._heightmapTexture.createView();
    this._ownsHeightmap = true;
    this._recreateBindGroups();
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

  onDestroy(): void {
    // Unregister from RenderSystem
    if (this._registered && RenderSystem.current) {
      RenderSystem.current.removeRendererPlugin(this);
      this._registered = false;
    }

    for (const go of this._ringObjects) {
      this._scene?.remove(go);
    }
    this._ringObjects.length = 0;
    this._rings.length = 0;

    if (this._ownsHeightmap && this._heightmapTexture) {
      this._heightmapTexture.destroy();
    }
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
