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
  device.queue.writeBuffer(vertexBuffer, 0, vertices as GPUAllowSharedBufferSource);

  // writeBuffer requires byte length to be a multiple of 4.
  // Uint16Array with odd element count (e.g. 3 indices = 6 bytes) needs padding.
  const alignedByteSize = Math.ceil(indices.byteLength / 4) * 4;
  const indexBuffer = device.createBuffer({
    size: alignedByteSize,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  if (indices.byteLength === alignedByteSize) {
    device.queue.writeBuffer(indexBuffer, 0, indices as GPUAllowSharedBufferSource);
  } else {
    const padded = new Uint8Array(alignedByteSize);
    padded.set(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength));
    device.queue.writeBuffer(indexBuffer, 0, padded as GPUAllowSharedBufferSource);
  }

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
