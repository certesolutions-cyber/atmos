import { createWireframePipeline } from '@certe/atmos-renderer';
import type { WireframePipelineResources } from '@certe/atmos-renderer';
import type { MeshRenderer, Mesh } from '@certe/atmos-renderer';

/**
 * Converts triangle indices to line-list indices with edge deduplication.
 * For each triangle (a, b, c), emits edges (a,b), (b,c), (c,a)
 * but deduplicates so each edge is only drawn once.
 */
function buildLineIndices(mesh: Mesh): Uint32Array {
  const indices = mesh.indices;
  if (!indices) return new Uint32Array(0);

  const edgeSet = new Set<bigint>();
  const lines: number[] = [];
  const count = indices.length;

  for (let i = 0; i + 2 < count; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;

    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  function addEdge(v0: number, v1: number): void {
    const lo = v0 < v1 ? v0 : v1;
    const hi = v0 < v1 ? v1 : v0;
    const key = (BigInt(lo) << 32n) | BigInt(hi);
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    lines.push(v0, v1);
  }

  return new Uint32Array(lines);
}

export class WireframeRenderer {
  private _enabled = false;
  private _pipeline: WireframePipelineResources | null = null;
  private _device: GPUDevice;
  private _colorBuffer: GPUBuffer | null = null;
  private _colorBindGroup: GPUBindGroup | null = null;

  /** Cached line index buffers per mesh */
  private readonly _lineIndexCache = new WeakMap<Mesh, { buffer: GPUBuffer; count: number }>();

  constructor(device: GPUDevice) {
    this._device = device;
  }

  get enabled(): boolean { return this._enabled; }

  setEnabled(on: boolean): void {
    this._enabled = on;
  }

  render(
    pass: GPURenderPassEncoder,
    meshRenderers: MeshRenderer[],
  ): void {
    if (!this._enabled || meshRenderers.length === 0) return;

    if (!this._pipeline) {
      this._pipeline = createWireframePipeline(this._device);
      this._createColorUniform();
    }

    pass.setPipeline(this._pipeline.pipeline);
    pass.setBindGroup(1, this._colorBindGroup!);

    for (const mr of meshRenderers) {
      if (!mr.mesh || !mr.bindGroup) continue;
      const lineData = this._getOrCreateLineIndex(mr.mesh);
      if (!lineData || lineData.count === 0) continue;

      pass.setBindGroup(0, mr.bindGroup);
      pass.setVertexBuffer(0, mr.mesh.vertexBuffer);
      pass.setIndexBuffer(lineData.buffer, 'uint32');
      pass.drawIndexed(lineData.count);
    }
  }

  private _createColorUniform(): void {
    // Bright green wireframe color (linear space, HDR-safe)
    const colorData = new Float32Array([0.0, 2.0, 0.5, 1.0]);
    this._colorBuffer = this._device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._colorBuffer, 0, colorData);

    this._colorBindGroup = this._device.createBindGroup({
      layout: this._pipeline!.colorBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this._colorBuffer } },
      ],
    });
  }

  private _getOrCreateLineIndex(mesh: Mesh): { buffer: GPUBuffer; count: number } | null {
    let cached = this._lineIndexCache.get(mesh);
    if (cached) return cached;

    if (!mesh.indices) return null;

    const lineIndices = buildLineIndices(mesh);
    if (lineIndices.length === 0) return null;

    const buffer = this._device.createBuffer({
      size: lineIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(buffer, 0, lineIndices as GPUAllowSharedBufferSource);

    cached = { buffer, count: lineIndices.length };
    this._lineIndexCache.set(mesh, cached);
    return cached;
  }

  destroy(): void {
    this._colorBuffer?.destroy();
  }
}
