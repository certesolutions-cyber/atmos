import { createUnlitPipeline } from '@atmos/renderer';
import type { UnlitPipelineResources } from '@atmos/renderer';
import type { ColliderGizmoData } from './bootstrap/types.js';

/** Bright green wireframe color. */
const COLOR: [number, number, number] = [0.2, 1.0, 0.3];

const FLOATS_PER_VERT = 6; // position(3) + color(3)
const CIRCLE_SEGS = 32;
const ARC_SEGS = 16;

// Max verts: 8 colliders × 264 verts (capsule worst case)
const MAX_VERTS = 8 * 264;
const VERTEX_BUF_SIZE = MAX_VERTS * FLOATS_PER_VERT * 4;
const UNIFORM_SIZE = 64; // mat4

// Scratch rotation matrix (3×3 from quaternion)
const _r = new Float32Array(9);

function quatToMat3(q: { x: number; y: number; z: number; w: number }): void {
  const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
  const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2;
  const yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
  const wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
  _r[0] = 1 - (yy + zz); _r[1] = xy + wz;       _r[2] = xz - wy;
  _r[3] = xy - wz;       _r[4] = 1 - (xx + zz); _r[5] = yz + wx;
  _r[6] = xz + wy;       _r[7] = yz - wx;       _r[8] = 1 - (xx + yy);
}

/** Transform a local point by rotation matrix _r + translation. */
function transformPoint(
  lx: number, ly: number, lz: number,
  pos: { x: number; y: number; z: number },
): [number, number, number] {
  return [
    _r[0]! * lx + _r[3]! * ly + _r[6]! * lz + pos.x,
    _r[1]! * lx + _r[4]! * ly + _r[7]! * lz + pos.y,
    _r[2]! * lx + _r[5]! * ly + _r[8]! * lz + pos.z,
  ];
}

function writeVert(
  buf: Float32Array, o: number,
  x: number, y: number, z: number,
): number {
  buf[o] = x; buf[o + 1] = y; buf[o + 2] = z;
  buf[o + 3] = COLOR[0]; buf[o + 4] = COLOR[1]; buf[o + 5] = COLOR[2];
  return o + FLOATS_PER_VERT;
}

function writeCircle(
  buf: Float32Array, o: number, segs: number,
  pos: { x: number; y: number; z: number },
  radius: number, axisA: 0 | 1 | 2, axisB: 0 | 1 | 2, offset: number,
  offsetAxis: 0 | 1 | 2,
): number {
  const local = [0, 0, 0] as [number, number, number];
  local[offsetAxis] = offset;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    local[axisA] = Math.cos(a0) * radius;
    local[axisB] = Math.sin(a0) * radius;
    const p0 = transformPoint(local[0], local[1], local[2], pos);
    local[axisA] = Math.cos(a1) * radius;
    local[axisB] = Math.sin(a1) * radius;
    const p1 = transformPoint(local[0], local[1], local[2], pos);
    o = writeVert(buf, o, p0[0], p0[1], p0[2]);
    o = writeVert(buf, o, p1[0], p1[1], p1[2]);
  }
  return o;
}

function writeBox(
  buf: Float32Array, o: number, d: ColliderGizmoData,
): number {
  const h = d.halfExtents!;
  // 8 corners
  const corners: [number, number, number][] = [];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        corners.push(transformPoint(sx * h.x, sy * h.y, sz * h.z, d.position));
      }
    }
  }
  // 12 edges: connect corners that differ in exactly 1 axis
  // Corner indexing: bit0=x, bit1=y, bit2=z
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], // x edges
    [0, 2], [1, 3], [4, 6], [5, 7], // y edges
    [0, 4], [1, 5], [2, 6], [3, 7], // z edges
  ];
  for (const edge of edges) {
    const ca = corners[edge[0]!]!;
    const cb = corners[edge[1]!]!;
    o = writeVert(buf, o, ca[0], ca[1], ca[2]);
    o = writeVert(buf, o, cb[0], cb[1], cb[2]);
  }
  return o;
}

function writeSphere(
  buf: Float32Array, o: number, d: ColliderGizmoData,
): number {
  const r = d.radius!;
  // 3 great circles: XY, XZ, YZ
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 0, 1, 0, 2); // XY
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 0, 2, 0, 1); // XZ
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 1, 2, 0, 0); // YZ
  return o;
}

function writeCylinder(
  buf: Float32Array, o: number, d: ColliderGizmoData,
): number {
  const r = d.radius!;
  const hh = d.halfHeight!;
  // Top and bottom circles (XZ plane at ±halfHeight on Y)
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 0, 2, hh, 1);
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 0, 2, -hh, 1);
  // 4 vertical lines
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const lx = Math.cos(angle) * r;
    const lz = Math.sin(angle) * r;
    const top = transformPoint(lx, hh, lz, d.position);
    const bot = transformPoint(lx, -hh, lz, d.position);
    o = writeVert(buf, o, top[0], top[1], top[2]);
    o = writeVert(buf, o, bot[0], bot[1], bot[2]);
  }
  return o;
}

function writeCapsule(
  buf: Float32Array, o: number, d: ColliderGizmoData,
): number {
  const r = d.radius!;
  const hh = d.halfHeight!;
  // Cylinder body: top and bottom circles
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 0, 2, hh, 1);
  o = writeCircle(buf, o, CIRCLE_SEGS, d.position, r, 0, 2, -hh, 1);
  // 4 vertical lines
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const lx = Math.cos(angle) * r;
    const lz = Math.sin(angle) * r;
    const top = transformPoint(lx, hh, lz, d.position);
    const bot = transformPoint(lx, -hh, lz, d.position);
    o = writeVert(buf, o, top[0], top[1], top[2]);
    o = writeVert(buf, o, bot[0], bot[1], bot[2]);
  }
  // 4 hemisphere arcs (2 on top in XY and ZY planes, 2 on bottom)
  const writeArc = (
    centerY: number, startAngle: number, endAngle: number,
    axisH: 0 | 2, // horizontal axis (X or Z)
  ) => {
    for (let i = 0; i < ARC_SEGS; i++) {
      const a0 = startAngle + (i / ARC_SEGS) * (endAngle - startAngle);
      const a1 = startAngle + ((i + 1) / ARC_SEGS) * (endAngle - startAngle);
      const local0: [number, number, number] = [0, 0, 0];
      const local1: [number, number, number] = [0, 0, 0];
      local0[axisH] = Math.cos(a0) * r;
      local0[1] = centerY + Math.sin(a0) * r;
      local1[axisH] = Math.cos(a1) * r;
      local1[1] = centerY + Math.sin(a1) * r;
      const p0 = transformPoint(local0[0], local0[1], local0[2], d.position);
      const p1 = transformPoint(local1[0], local1[1], local1[2], d.position);
      o = writeVert(buf, o, p0[0], p0[1], p0[2]);
      o = writeVert(buf, o, p1[0], p1[1], p1[2]);
    }
  };
  // Top hemisphere arcs (0 to PI)
  writeArc(hh, 0, Math.PI, 0);       // XY plane
  writeArc(hh, 0, Math.PI, 2);       // ZY plane
  // Bottom hemisphere arcs (PI to 2PI)
  writeArc(-hh, Math.PI, Math.PI * 2, 0);  // XY plane
  writeArc(-hh, Math.PI, Math.PI * 2, 2);  // ZY plane
  return o;
}

export class ColliderGizmoRenderer {
  private readonly _device: GPUDevice;
  private readonly _pipeline: UnlitPipelineResources;
  private readonly _vertexBuffer: GPUBuffer;
  private readonly _uniformBuffer: GPUBuffer;
  private readonly _bindGroup: GPUBindGroup;
  private readonly _verts = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this._device = device;
    this._pipeline = createUnlitPipeline(device, format, {
      topology: 'line-list',
      depthWrite: false,
      depthCompare: 'always',
    });

    this._vertexBuffer = device.createBuffer({
      size: VERTEX_BUF_SIZE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

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
    colliders: ColliderGizmoData[],
  ): void {
    const v = this._verts;
    let o = 0;

    for (const d of colliders) {
      quatToMat3(d.rotation);
      switch (d.shapeType) {
        case 'box': o = writeBox(v, o, d); break;
        case 'sphere': o = writeSphere(v, o, d); break;
        case 'cylinder': o = writeCylinder(v, o, d); break;
        case 'capsule': o = writeCapsule(v, o, d); break;
      }
    }

    const vertCount = o / FLOATS_PER_VERT;
    if (vertCount === 0) return;

    this._device.queue.writeBuffer(
      this._vertexBuffer, 0,
      v.buffer as ArrayBuffer, v.byteOffset, vertCount * FLOATS_PER_VERT * 4,
    );
    this._device.queue.writeBuffer(
      this._uniformBuffer, 0,
      vp.buffer as ArrayBuffer, vp.byteOffset, vp.byteLength,
    );

    pass.setPipeline(this._pipeline.pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.draw(vertCount);
  }

  destroy(): void {
    this._vertexBuffer.destroy();
    this._uniformBuffer.destroy();
  }
}
