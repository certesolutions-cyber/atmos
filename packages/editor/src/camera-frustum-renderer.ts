import { Mat4 } from '@atmos/math';
import type { Mat4Type } from '@atmos/math';
import { Camera, createUnlitPipeline } from '@atmos/renderer';
import type { UnlitPipelineResources } from '@atmos/renderer';

/** Fixed distance for the far-plane visualization (keeps the frustum compact). */
const FAR_VIZ = 5;

/** Frustum wireframe color (light cyan). */
const COLOR: [number, number, number] = [0.45, 0.7, 1.0];

/** 6 floats per vertex: position(3) + color(3). */
const FLOATS_PER_VERT = 6;

/**
 * 8 corner vertices (4 near + 4 far).
 * Index order per plane (looking from camera toward -Z):
 *   0=TL  1=TR  2=BR  3=BL  (near)
 *   4=TL  5=TR  6=BR  7=BL  (far)
 */
const VERTEX_COUNT = 8;
const VERTEX_BUFFER_SIZE = VERTEX_COUNT * FLOATS_PER_VERT * 4; // bytes

/** 12 lines × 2 indices = 24 indices (line-list). */
// prettier-ignore
const INDICES = new Uint16Array([
  // near rectangle
  0, 1,  1, 2,  2, 3,  3, 0,
  // far rectangle
  4, 5,  5, 6,  6, 7,  7, 4,
  // connecting edges
  0, 4,  1, 5,  2, 6,  3, 7,
]);

const UNIFORM_SIZE = 64; // mat4x4

export class CameraFrustumRenderer {
  private readonly _device: GPUDevice;
  private readonly _pipeline: UnlitPipelineResources;
  private readonly _vertexBuffer: GPUBuffer;
  private readonly _indexBuffer: GPUBuffer;
  private readonly _uniformBuffer: GPUBuffer;
  private readonly _bindGroup: GPUBindGroup;
  private readonly _verts = new Float32Array(VERTEX_COUNT * FLOATS_PER_VERT);
  private readonly _mvp: Mat4Type = Mat4.create();

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this._device = device;
    this._pipeline = createUnlitPipeline(device, format, {
      topology: 'line-list',
      depthWrite: false,
      depthCompare: 'always',
    });

    this._vertexBuffer = device.createBuffer({
      size: VERTEX_BUFFER_SIZE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = device.createBuffer({
      size: INDICES.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._indexBuffer, 0, INDICES);

    this._uniformBuffer = device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._bindGroup = device.createBindGroup({
      layout: this._pipeline.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
    });
  }

  render(
    pass: GPURenderPassEncoder,
    vp: Float32Array,
    camera: Camera,
    aspect: number,
  ): void {
    const farViz = FAR_VIZ;
    const halfFov = camera.fovY * 0.5;
    const tanHalf = Math.tan(halfFov);

    const hNear = camera.near * tanHalf;
    const wNear = hNear * aspect;
    const hFar = farViz * tanHalf;
    const wFar = hFar * aspect;

    const [r, g, b] = COLOR;
    const v = this._verts;
    let o = 0;

    // Near plane corners (TL, TR, BR, BL) at z = -near
    const nz = -camera.near;
    o = writeVert(v, o, -wNear, hNear, nz, r, g, b);
    o = writeVert(v, o, wNear, hNear, nz, r, g, b);
    o = writeVert(v, o, wNear, -hNear, nz, r, g, b);
    o = writeVert(v, o, -wNear, -hNear, nz, r, g, b);

    // Far plane corners (TL, TR, BR, BL) at z = -farViz
    const fz = -farViz;
    o = writeVert(v, o, -wFar, hFar, fz, r, g, b);
    o = writeVert(v, o, wFar, hFar, fz, r, g, b);
    o = writeVert(v, o, wFar, -hFar, fz, r, g, b);
    writeVert(v, o, -wFar, -hFar, fz, r, g, b);

    this._device.queue.writeBuffer(this._vertexBuffer, 0, v);

    // MVP = VP × cameraWorldMatrix (vertices are in camera-local space)
    Mat4.multiply(this._mvp, vp, camera.gameObject.transform.worldMatrix);
    this._device.queue.writeBuffer(this._uniformBuffer, 0, this._mvp as GPUAllowSharedBufferSource);

    pass.setPipeline(this._pipeline.pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(INDICES.length);
  }

  destroy(): void {
    this._vertexBuffer.destroy();
    this._indexBuffer.destroy();
    this._uniformBuffer.destroy();
  }
}

function writeVert(
  buf: Float32Array, offset: number,
  x: number, y: number, z: number,
  r: number, g: number, b: number,
): number {
  buf[offset] = x;
  buf[offset + 1] = y;
  buf[offset + 2] = z;
  buf[offset + 3] = r;
  buf[offset + 4] = g;
  buf[offset + 5] = b;
  return offset + FLOATS_PER_VERT;
}
