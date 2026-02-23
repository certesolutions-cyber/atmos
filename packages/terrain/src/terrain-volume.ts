import { Component, GameObject, Scene } from '@atmos/core';
import { MeshRenderer, createMaterial } from '@atmos/renderer';
import type { Material, MeshRendererContext } from '@atmos/renderer';
import { TerrainChunk } from './chunk.js';
import { chunkKey } from './chunk-key.js';
import { applyEdit } from './terrain-editor.js';
import type { DensityFn, TerrainConfig, TerrainEdit } from './types.js';
import { DEFAULT_TERRAIN_CONFIG } from './types.js';

/**
 * Bounded terrain volume component.
 * Manages an NxMxP grid of terrain chunks as child GameObjects with MeshRenderers.
 */
export class TerrainVolume extends Component {
  /** Number of chunks along each axis */
  chunksX = 4;
  chunksY = 2;
  chunksZ = 4;

  config: TerrainConfig = { ...DEFAULT_TERRAIN_CONFIG };

  private _densityFn: DensityFn = () => 1;
  private _chunks = new Map<number, TerrainChunk>();
  private _chunkObjects = new Map<number, GameObject>();
  private _rendererCtx: MeshRendererContext | null = null;
  private _scene: Scene | null = null;
  private _material: Material | null = null;
  /** GOs kept alive for 1 overlap frame, then moved to _pendingRemoval. */
  private _pendingDisable: GameObject[] = [];
  /** GOs with disabled MR, ready for scene removal + buffer destruction. */
  private _pendingRemoval: GameObject[] = [];

  setDensityFn(fn: DensityFn): void {
    this._densityFn = fn;
  }

  init(
    device: GPUDevice,
    pipelineResources: import('@atmos/renderer').PipelineResources,
    scene: Scene,
    material?: Material,
  ): void {
    this._rendererCtx = { device, pipelineResources };
    this._scene = scene;
    this._material = material ?? createMaterial({ roughness: 0.8, metallic: 0.0 });
  }

  build(): void {
    if (!this._rendererCtx || !this._scene) return;

    this._destroyAllChunks();

    for (let cz = 0; cz < this.chunksZ; cz++) {
      for (let cy = 0; cy < this.chunksY; cy++) {
        for (let cx = 0; cx < this.chunksX; cx++) {
          this._buildChunk(cx, cy, cz);
        }
      }
    }
  }

  edit(op: TerrainEdit): void {
    const dirtyKeys = applyEdit(
      op, this._chunks,
      this.config.chunkSize, this.config.voxelSize,
    );

    for (const key of dirtyKeys) {
      const chunk = this._chunks.get(key);
      if (!chunk || !this._rendererCtx) continue;
      this._rebuildChunkMesh(key, chunk);
    }
  }

  onDestroy(): void {
    this._destroyAllChunks();
  }

  onRender(): void {
    this._flushRemovals();
  }

  private _buildChunk(cx: number, cy: number, cz: number): void {
    if (!this._rendererCtx || !this._scene) return;

    const key = chunkKey(cx, cy, cz);
    const chunk = new TerrainChunk(cx, cy, cz, this.config.chunkSize);

    chunk.sampleDensity(this._densityFn, this.config.voxelSize);
    const mesh = chunk.buildMesh(this._rendererCtx.device, this.config, this._densityFn);
    this._chunks.set(key, chunk);

    if (!mesh) return;

    const go = this._createChunkObject(cx, cy, cz, mesh);
    this._chunkObjects.set(key, go);
  }

  private _rebuildChunkMesh(key: number, chunk: TerrainChunk): void {
    if (!this._rendererCtx || !this._scene) return;

    const mesh = chunk.buildMesh(this._rendererCtx.device, this.config, this._densityFn);

    // Keep old GO alive with MR enabled for 1 overlap frame
    const oldGo = this._chunkObjects.get(key);
    if (oldGo) {
      this._pendingDisable.push(oldGo);
      this._chunkObjects.delete(key);
    }

    if (!mesh) return;

    const go = this._createChunkObject(chunk.cx, chunk.cy, chunk.cz, mesh);
    this._chunkObjects.set(key, go);
  }

  /**
   * Two-phase deferred removal:
   * Phase 1: disable overlap GOs (were drawn alongside replacement last frame)
   * Phase 2: destroy GOs that were disabled last frame (safe after submit)
   */
  private _flushRemovals(): void {
    for (const go of this._pendingRemoval) {
      const mr = go.getComponent(MeshRenderer);
      if (mr) mr.destroyMesh();
      if (this._scene) this._scene.remove(go);
    }
    this._pendingRemoval.length = 0;

    for (const go of this._pendingDisable) {
      const mr = go.getComponent(MeshRenderer);
      if (mr) mr.enabled = false;
      this._pendingRemoval.push(go);
    }
    this._pendingDisable.length = 0;
  }

  private _createChunkObject(
    cx: number, cy: number, cz: number, mesh: import('@atmos/renderer').Mesh,
  ): GameObject {
    const chunkWorldSize = this.config.chunkSize * this.config.voxelSize;
    const go = new GameObject(`Chunk_${cx}_${cy}_${cz}`);
    go.transient = true;
    go.setParent(this.gameObject);
    go.transform.setPosition(cx * chunkWorldSize, cy * chunkWorldSize, cz * chunkWorldSize);
    go.transform.updateWorldMatrix();
    this._scene!.add(go);

    const mr = go.addComponent(MeshRenderer);
    mr.init(this._rendererCtx!, mesh, this._material ?? undefined);
    return go;
  }

  private _destroyGO(go: GameObject): void {
    const mr = go.getComponent(MeshRenderer);
    if (mr) mr.destroyMesh();
    if (this._scene) this._scene.remove(go);
  }

  private _destroyAllChunks(): void {
    for (const go of this._pendingRemoval) this._destroyGO(go);
    this._pendingRemoval.length = 0;
    for (const go of this._pendingDisable) this._destroyGO(go);
    this._pendingDisable.length = 0;

    for (const [, go] of this._chunkObjects) this._destroyGO(go);
    this._chunkObjects.clear();
    for (const [, chunk] of this._chunks) chunk.destroyCPU();
    this._chunks.clear();
  }
}
