import type { BoundingSphere } from './bounds.js';

export interface Mesh {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  indexFormat: GPUIndexFormat;
  bounds?: BoundingSphere;
  /** CPU-side vertex data for ray picking */
  vertices?: Float32Array;
  /** CPU-side index data for ray picking */
  indices?: Uint16Array | Uint32Array;
  /** Floats per vertex (e.g. 8 for pos+normal+uv) */
  vertexStride?: number;
}

export function createMesh(
  device: GPUDevice,
  vertices: Float32Array,
  indices: Uint16Array | Uint32Array,
  vertexStride?: number,
): Mesh {
  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const indexFormat: GPUIndexFormat = indices instanceof Uint32Array ? 'uint32' : 'uint16';

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: indices.length,
    indexFormat,
    vertices,
    indices,
    vertexStride,
  };
}
