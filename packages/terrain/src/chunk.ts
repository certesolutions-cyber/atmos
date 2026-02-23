import { createMesh } from '@atmos/renderer';
import type { Mesh } from '@atmos/renderer';
import { computeBoundingSphere, VERTEX_STRIDE_FLOATS } from '@atmos/renderer';
import { extractSurface, computeTriplanarUVs } from './marching-cubes.js';
import { computeGradientNormals, computeTriangleNormals } from './terrain-normals.js';
import type { DensityFn, TerrainConfig, MeshData } from './types.js';
import { ChunkState } from './types.js';

/**
 * Maximum triangles per chunk (worst case: ~5 triangles per voxel).
 * Used to pre-allocate scratch buffers.
 */
function maxTriangles(size: number): number {
  return size * size * size * 5;
}

function maxVertices(size: number): number {
  return maxTriangles(size) * 3;
}

/**
 * A single terrain chunk: owns a density grid, scratch buffers, and a GPU mesh.
 */
export class TerrainChunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly densityGrid: Float32Array;

  state = ChunkState.Empty;
  mesh: Mesh | null = null;
  lastMeshData: MeshData | null = null;
  lodLevel = 0;
  skirtFaces = 0;

  private readonly _size: number;
  private readonly _gridLen: number;
  private _scratchVerts: Float32Array | null = null;
  private _scratchIdx: Uint32Array | null = null;

  constructor(cx: number, cy: number, cz: number, size: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this._size = size;
    this._gridLen = (size + 1) ** 3;
    this.densityGrid = new Float32Array(this._gridLen);
  }

  /** Fill the density grid by sampling the density function. */
  sampleDensity(
    fn: DensityFn,
    voxelSize: number,
  ): void {
    const s = this._size;
    const s1 = s + 1;
    const originX = this.cx * s * voxelSize;
    const originY = this.cy * s * voxelSize;
    const originZ = this.cz * s * voxelSize;

    for (let z = 0; z <= s; z++) {
      for (let y = 0; y <= s; y++) {
        for (let x = 0; x <= s; x++) {
          const wx = originX + x * voxelSize;
          const wy = originY + y * voxelSize;
          const wz = originZ + z * voxelSize;
          this.densityGrid[z * s1 * s1 + y * s1 + x] = fn(wx, wy, wz);
        }
      }
    }
    this.state = ChunkState.Sampled;
  }

  /**
   * Run marching cubes + normals + UVs and create a GPU mesh.
   * Returns the Mesh, or null if the chunk produced no geometry.
   */
  buildMesh(
    device: GPUDevice,
    config: TerrainConfig,
    densityFn?: DensityFn,
  ): Mesh | null {
    const s = this._size;

    // Lazy-allocate scratch buffers
    if (!this._scratchVerts) {
      this._scratchVerts = new Float32Array(maxVertices(s) * VERTEX_STRIDE_FLOATS);
    }
    if (!this._scratchIdx) {
      this._scratchIdx = new Uint32Array(maxTriangles(s) * 3);
    }

    const meshData = extractSurface(
      this.densityGrid,
      s,
      config.voxelSize,
      config.isoLevel,
      this._scratchVerts,
      this._scratchIdx,
    );

    if (meshData.vertexCount === 0 || meshData.indexCount === 0) {
      this.destroyMesh();
      this.lastMeshData = null;
      this.state = ChunkState.Meshed;
      return null;
    }

    // Compute normals
    if (config.smoothNormals && densityFn) {
      const voxelSize = config.voxelSize;
      const originX = this.cx * s * voxelSize;
      const originY = this.cy * s * voxelSize;
      const originZ = this.cz * s * voxelSize;
      // Offset density function to chunk-local coords → world coords
      const worldDensity: DensityFn = (x, y, z) =>
        densityFn(x + originX, y + originY, z + originZ);
      computeGradientNormals(
        meshData.vertices, meshData.vertexCount,
        worldDensity, config.normalEpsilon,
      );
    } else {
      computeTriangleNormals(
        meshData.vertices, meshData.indices,
        meshData.vertexCount, meshData.indexCount,
      );
    }

    // Compute triplanar UVs after normals are ready
    computeTriplanarUVs(meshData.vertices, meshData.vertexCount);

    // Trim to actual size for GPU upload
    const trimmedVerts = meshData.vertices.subarray(0, meshData.vertexCount * VERTEX_STRIDE_FLOATS);
    const trimmedIdx = meshData.indices.subarray(0, meshData.indexCount);

    // Detach old mesh reference (caller is responsible for destroying old
    // GPU buffers via MeshRenderer.destroyMesh() after submit completes).
    this.mesh = null;

    const gpuMesh = createMesh(device, trimmedVerts, trimmedIdx, VERTEX_STRIDE_FLOATS);
    gpuMesh.bounds = computeBoundingSphere(trimmedVerts, VERTEX_STRIDE_FLOATS);
    this.mesh = gpuMesh;
    this.lastMeshData = meshData;
    this.state = ChunkState.Meshed;

    return gpuMesh;
  }

  /** Destroy the GPU mesh, keeping density data intact. */
  destroyMesh(): void {
    if (this.mesh) {
      this.mesh.vertexBuffer.destroy();
      this.mesh.indexBuffer.destroy();
      this.mesh = null;
    }
  }

  /** Release CPU-side scratch buffers (keeps GPU mesh alive). */
  destroyCPU(): void {
    this._scratchVerts = null;
    this._scratchIdx = null;
    this.lastMeshData = null;
  }

  /** Full cleanup: GPU + CPU resources. */
  destroy(): void {
    this.destroyMesh();
    this.destroyCPU();
  }
}
