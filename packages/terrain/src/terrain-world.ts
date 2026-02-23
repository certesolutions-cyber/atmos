import { Component, GameObject, Scene } from "@atmos/core";
import {
  MeshRenderer,
  TerrainMeshRenderer,
  createMaterial,
} from "@atmos/renderer";
import type {
  Material,
  MeshRendererContext,
} from "@atmos/renderer";
import type { TerrainPipelineResources } from "@atmos/renderer";
import { TerrainChunk } from "./chunk.js";
import { buildLODMesh, buildLODSplatMesh } from "./lod-chunk.js";
import { chunkKey, fromChunkKey, worldToChunk } from "./chunk-key.js";
import { applyEdit } from "./terrain-editor.js";
import type {
  DensityFn,
  TerrainConfig,
  TerrainEdit,
  LODConfig,
  SplatWeightFn,
  SplatTextures,
} from "./types.js";
import { DEFAULT_TERRAIN_CONFIG, DEFAULT_LOD_CONFIG } from "./types.js";

interface QueueEntry {
  key: number;
  cx: number;
  cy: number;
  cz: number;
  distSq: number;
}

/** Infinite terrain world: streams chunks around a focus point with 3-level LOD. */
export class TerrainWorld extends Component {
  /** Chunk load radius (in chunks) */
  loadRadius = 4;
  /** Chunk unload radius (in chunks, should be > loadRadius for hysteresis) */
  unloadRadius = 6;
  /** Max chunk mesh builds per frame (amortization) */
  maxBuildsPerFrame = 2;
  /** Per-frame time budget for chunk builds in ms (overrides maxBuildsPerFrame). */
  buildBudgetMs = 8;

  /** GO whose world position is the terrain focus point (e.g. camera). */
  cameraTarget: GameObject | null = null;

  config: TerrainConfig = { ...DEFAULT_TERRAIN_CONFIG };
  lodConfig: LODConfig = { ...DEFAULT_LOD_CONFIG };

  private _densityFn: DensityFn = () => 1;
  private _chunks = new Map<number, TerrainChunk>();
  private _chunkObjects = new Map<number, GameObject>();
  private _rendererCtx: MeshRendererContext | null = null;
  private _scene: Scene | null = null;
  private _material: Material | null = null;

  // Splat materials (optional — falls back to single-material MeshRenderer)
  private _terrainPipeline: TerrainPipelineResources | null = null;
  private _splatTextures: SplatTextures | null = null;
  private _weightFn: SplatWeightFn | null = null;

  private _focusX = 0;
  private _focusY = 0;
  private _focusZ = 0;
  private _buildQueue: QueueEntry[] = [];
  private _queuedKeys = new Set<number>();
  private _pendingDisable: GameObject[] = [];
  private _pendingRemoval: GameObject[] = [];
  private _initialized = false;

  setDensityFn(fn: DensityFn): void {
    this._densityFn = fn;
  }

  setFocus(x: number, y: number, z: number): void {
    this._focusX = x;
    this._focusY = y;
    this._focusZ = z;
  }

  init(
    device: GPUDevice,
    pipelineResources: import('@atmos/renderer').PipelineResources,
    scene: Scene,
    material?: Material,
  ): void {
    this._rendererCtx = { device, pipelineResources };
    this._scene = scene;
    this._material =
      material ?? createMaterial({ roughness: 0.8, metallic: 0.0 });
    this._initialized = true;
  }

  /** Enable terrain splatting with 3 textures and a weight function. */
  setSplatMaterials(
    terrainPipeline: TerrainPipelineResources,
    textures: SplatTextures,
    weightFn: SplatWeightFn,
  ): void {
    this._terrainPipeline = terrainPipeline;
    this._splatTextures = textures;
    this._weightFn = weightFn;
  }

  get isSplatting(): boolean {
    return (
      this._terrainPipeline !== null &&
      this._splatTextures !== null &&
      this._weightFn !== null
    );
  }

  onRender(): void {
    if (!this._initialized) return;

    if (this.cameraTarget) {
      const m = this.cameraTarget.transform.worldMatrix;
      this._focusX = m[12]!;
      this._focusY = m[13]!;
      this._focusZ = m[14]!;
    }

    this._flushRemovals();

    this._queueNewChunks();
    this._detectLODChanges();
    this._unloadDistantChunks();
    this._processBuildQueue();
  }

  edit(op: TerrainEdit): void {
    const dirtyKeys = applyEdit(
      op,
      this._chunks,
      this.config.chunkSize,
      this.config.voxelSize,
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

  /** Compute LOD level for a chunk based on distance to focus. */
  private _computeLOD(cx: number, cy: number, cz: number): number {
    const chunkWorldSize = this.config.chunkSize * this.config.voxelSize;
    const [fcx, fcy, fcz] = worldToChunk(
      this._focusX,
      this._focusY,
      this._focusZ,
      chunkWorldSize,
    );
    const dx = cx - fcx;
    const dy = cy - fcy;
    const dz = cz - fcz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const [d0, d1] = this.lodConfig.lodDistances;
    if (dist < d0) return 0;
    if (dist < d1) return 1;
    return 2;
  }

  /** 6-bit mask: bit set when neighbor has different LOD (overlap needed). */
  private _computeSkirtFaces(
    cx: number,
    cy: number,
    cz: number,
    myLod: number,
  ): number {
    let mask = 0;
    const offsets = [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ] as const;
    for (let f = 0; f < 6; f++) {
      const o = offsets[f]!;
      const neighborLod = this._computeLOD(cx + o[0], cy + o[1], cz + o[2]);
      if (neighborLod !== myLod) {
        mask |= 1 << f;
      }
    }
    return mask;
  }

  private _queueNewChunks(): void {
    const chunkWorldSize = this.config.chunkSize * this.config.voxelSize;
    const [fcx, fcy, fcz] = worldToChunk(
      this._focusX,
      this._focusY,
      this._focusZ,
      chunkWorldSize,
    );
    const r = this.loadRadius;

    for (let dz = -r; dz <= r; dz++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > r * r) continue;

          const cx = fcx + dx;
          const cy = fcy + dy;
          const cz = fcz + dz;
          const key = chunkKey(cx, cy, cz);

          if (this._chunks.has(key)) continue;
          if (this._queuedKeys.has(key)) continue;

          this._buildQueue.push({ key, cx, cy, cz, distSq });
          this._queuedKeys.add(key);
        }
      }
    }

    this._buildQueue.sort((a, b) => a.distSq - b.distSq);
  }

  /** Queue chunks whose LOD or skirt mask changed for re-meshing. */
  private _detectLODChanges(): void {
    const chunkWorldSize = this.config.chunkSize * this.config.voxelSize;
    const [fcx, fcy, fcz] = worldToChunk(
      this._focusX,
      this._focusY,
      this._focusZ,
      chunkWorldSize,
    );
    for (const [key, chunk] of this._chunks) {
      const newLod = this._computeLOD(chunk.cx, chunk.cy, chunk.cz);
      const newSkirt = this._computeSkirtFaces(
        chunk.cx,
        chunk.cy,
        chunk.cz,
        newLod,
      );
      if (newLod !== chunk.lodLevel || newSkirt !== chunk.skirtFaces) {
        if (this._queuedKeys.has(key)) continue;
        const dx = chunk.cx - fcx,
          dy = chunk.cy - fcy,
          dz = chunk.cz - fcz;
        this._buildQueue.push({
          key,
          cx: chunk.cx,
          cy: chunk.cy,
          cz: chunk.cz,
          distSq: dx * dx + dy * dy + dz * dz,
        });
        this._queuedKeys.add(key);
      }
    }
  }

  private _unloadDistantChunks(): void {
    const chunkWorldSize = this.config.chunkSize * this.config.voxelSize;
    const [fcx, fcy, fcz] = worldToChunk(
      this._focusX,
      this._focusY,
      this._focusZ,
      chunkWorldSize,
    );
    const rSq = this.unloadRadius * this.unloadRadius;

    const toRemove: number[] = [];
    for (const [key] of this._chunks) {
      const [cx, cy, cz] = fromChunkKey(key);
      const dx = cx - fcx;
      const dy = cy - fcy;
      const dz = cz - fcz;
      if (dx * dx + dy * dy + dz * dz > rSq) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this._removeChunk(key);
    }
  }

  private _processBuildQueue(): void {
    if (!this._rendererCtx || !this._scene) return;

    const deadline = performance.now() + this.buildBudgetMs;
    let built = 0;
    let idx = 0;

    while (idx < this._buildQueue.length && performance.now() < deadline) {
      const entry = this._buildQueue[idx++]!;
      this._queuedKeys.delete(entry.key);

      const existing = this._chunks.get(entry.key);
      if (existing) {
        this._remeshExisting(entry.key, existing);
        built++;
        continue;
      }

      const chunk = new TerrainChunk(
        entry.cx,
        entry.cy,
        entry.cz,
        this.config.chunkSize,
      );
      chunk.sampleDensity(this._densityFn, this.config.voxelSize);

      const lodLevel = this._computeLOD(entry.cx, entry.cy, entry.cz);
      const skirtFaces = this._computeSkirtFaces(
        entry.cx,
        entry.cy,
        entry.cz,
        lodLevel,
      );
      chunk.lodLevel = lodLevel;
      chunk.skirtFaces = skirtFaces;

      const mesh = this._buildMesh(chunk, lodLevel, skirtFaces);
      this._chunks.set(entry.key, chunk);

      if (mesh) {
        const go = this._createChunkObject(entry.cx, entry.cy, entry.cz, mesh);
        this._chunkObjects.set(entry.key, go);
      }

      built++;
    }

    // Remove processed entries from queue front
    if (idx > 0) {
      this._buildQueue.splice(0, idx);
    }
  }

  /** Re-mesh an existing chunk with updated LOD / skirt info. */
  private _remeshExisting(key: number, chunk: TerrainChunk): void {
    const newLod = this._computeLOD(chunk.cx, chunk.cy, chunk.cz);
    const newSkirt = this._computeSkirtFaces(
      chunk.cx,
      chunk.cy,
      chunk.cz,
      newLod,
    );
    chunk.lodLevel = newLod;
    chunk.skirtFaces = newSkirt;
    this._rebuildChunkMesh(key, chunk);
  }

  private _buildMesh(
    chunk: TerrainChunk,
    lodLevel: number,
    skirtFaces: number,
  ): import("@atmos/renderer").Mesh | null {
    if (!this._rendererCtx) return null;
    if (this.isSplatting) {
      return buildLODSplatMesh(
        chunk,
        this._rendererCtx!.device,
        this.config,
        lodLevel,
        skirtFaces,
        this._densityFn,
        this._weightFn!,
      );
    }
    return buildLODMesh(
      chunk,
      this._rendererCtx!.device,
      this.config,
      lodLevel,
      skirtFaces,
      this._densityFn,
    );
  }

  private _rebuildChunkMesh(key: number, chunk: TerrainChunk): void {
    if (!this._rendererCtx || !this._scene) return;

    const mesh = this._buildMesh(chunk, chunk.lodLevel, chunk.skirtFaces);

    const oldGo = this._chunkObjects.get(key);

    if (!mesh) {
      // No geometry — remove old GO if present
      if (oldGo) {
        this._deferRemoval(oldGo);
        this._chunkObjects.delete(key);
      }
      return;
    }

    const go = this._createChunkObject(chunk.cx, chunk.cy, chunk.cz, mesh);
    this._chunkObjects.set(key, go);

    // Keep old GO alive 1 frame for overlap (depth buffer resolves)
    if (oldGo) {
      this._pendingDisable.push(oldGo);
    }
  }

  private _createChunkObject(
    cx: number,
    cy: number,
    cz: number,
    mesh: import("@atmos/renderer").Mesh,
  ): GameObject {
    const chunkWorldSize = this.config.chunkSize * this.config.voxelSize;
    const go = new GameObject(`Chunk_${cx}_${cy}_${cz}`);
    go.transient = true;
    go.setParent(this.gameObject);
    go.transform.setPosition(
      cx * chunkWorldSize,
      cy * chunkWorldSize,
      cz * chunkWorldSize,
    );
    go.transform.updateWorldMatrix();
    this._scene!.add(go);

    if (this.isSplatting && this._terrainPipeline && this._splatTextures) {
      const tmr = go.addComponent(TerrainMeshRenderer);
      tmr.init(
        this._rendererCtx!.device,
        this._terrainPipeline,
        mesh,
        this._material ?? undefined,
        this._splatTextures,
      );
    } else {
      const mr = go.addComponent(MeshRenderer);
      mr.init(this._rendererCtx!, mesh, this._material ?? undefined);
    }
    return go;
  }

  private _removeChunk(key: number): void {
    const go = this._chunkObjects.get(key);
    if (go) this._deferRemoval(go);
    this._chunkObjects.delete(key);
    const chunk = this._chunks.get(key);
    if (chunk) chunk.destroyCPU();
    this._chunks.delete(key);
  }

  /** Immediately disable renderer and queue GO for destruction next frame. */
  private _deferRemoval(go: GameObject): void {
    const mr = go.getComponent(MeshRenderer);
    if (mr) mr.enabled = false;
    const tmr = go.getComponent(TerrainMeshRenderer);
    if (tmr) tmr.enabled = false;
    this._pendingRemoval.push(go);
  }

  /** Two-phase deferred removal: disable → destroy (1 frame overlap for replacements). */
  private _flushRemovals(): void {
    for (const go of this._pendingRemoval) this._destroyGO(go);
    this._pendingRemoval.length = 0;
    for (const go of this._pendingDisable) {
      const mr = go.getComponent(MeshRenderer);
      if (mr) mr.enabled = false;
      const tmr = go.getComponent(TerrainMeshRenderer);
      if (tmr) tmr.enabled = false;
      this._pendingRemoval.push(go);
    }
    this._pendingDisable.length = 0;
  }

  private _destroyGO(go: GameObject): void {
    const mr = go.getComponent(MeshRenderer);
    if (mr) mr.destroyMesh();
    const tmr = go.getComponent(TerrainMeshRenderer);
    if (tmr) tmr.destroyMesh();
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
    this._buildQueue = [];
    this._queuedKeys.clear();
  }
}
