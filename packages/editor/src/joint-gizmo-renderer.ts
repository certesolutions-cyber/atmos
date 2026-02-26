import { createUnlitPipeline } from '@atmos/renderer';
import type { UnlitPipelineResources } from '@atmos/renderer';
import type { JointGizmoData } from './bootstrap/types.js';

/** Arrow length in world units. */
const ARROW_LEN = 0.4;
/** Cone head length as fraction of arrow. */
const HEAD_FRAC = 0.2;
/** Cone head radius. */
const HEAD_RADIUS = 0.02;
/** Number of segments for the cone head. */
const CONE_SEGS = 6;

/** Body 1 axis color (orange). */
const COLOR1: [number, number, number] = [1.0, 0.6, 0.0];
/** Body 2 axis color (cyan). */
const COLOR2: [number, number, number] = [0.0, 0.8, 1.0];

/** 6 floats per vertex: position(3) + color(3). */
const FLOATS_PER_VERT = 6;

/**
 * Per arrow: 1 shaft line (2 verts) + cone lines (CONE_SEGS * 2 verts: base-to-tip).
 * Total verts per arrow = 2 + CONE_SEGS * 2.
 * Two arrows per joint.
 */
const VERTS_PER_ARROW = 2 + CONE_SEGS * 2;
const VERTS_PER_JOINT = VERTS_PER_ARROW * 2;
const MAX_JOINTS = 8;
const MAX_VERTS = VERTS_PER_JOINT * MAX_JOINTS;
const VERTEX_BUF_SIZE = MAX_VERTS * FLOATS_PER_VERT * 4;

const UNIFORM_SIZE = 64; // mat4

export class JointGizmoRenderer {
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
    joints: JointGizmoData[],
  ): void {
    const v = this._verts;
    let o = 0;
    const count = Math.min(joints.length, MAX_JOINTS);

    for (let i = 0; i < count; i++) {
      const j = joints[i]!;
      o = writeArrow(v, o, j.origin1, j.dir1, COLOR1);
      o = writeArrow(v, o, j.origin2, j.dir2, COLOR2);
    }

    const vertCount = count * VERTS_PER_JOINT;
    if (vertCount === 0) return;

    this._device.queue.writeBuffer(
      this._vertexBuffer, 0,
      v.buffer as ArrayBuffer, v.byteOffset, vertCount * FLOATS_PER_VERT * 4,
    );

    // MVP = VP (vertices are in world space, so model = identity)
    this._device.queue.writeBuffer(this._uniformBuffer, 0, vp.buffer as ArrayBuffer, vp.byteOffset, vp.byteLength);

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

function writeArrow(
  buf: Float32Array, offset: number,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  color: [number, number, number],
): number {
  const [r, g, b] = color;
  const tipX = origin.x + dir.x * ARROW_LEN;
  const tipY = origin.y + dir.y * ARROW_LEN;
  const tipZ = origin.z + dir.z * ARROW_LEN;

  // Shaft line: origin → tip
  offset = writeVert(buf, offset, origin.x, origin.y, origin.z, r, g, b);
  offset = writeVert(buf, offset, tipX, tipY, tipZ, r, g, b);

  // Cone head: find two perpendicular vectors to dir
  const { u, v } = perp(dir);
  const baseX = tipX - dir.x * ARROW_LEN * HEAD_FRAC;
  const baseY = tipY - dir.y * ARROW_LEN * HEAD_FRAC;
  const baseZ = tipZ - dir.z * ARROW_LEN * HEAD_FRAC;

  for (let i = 0; i < CONE_SEGS; i++) {
    const angle = (i / CONE_SEGS) * Math.PI * 2;
    const cos = Math.cos(angle) * HEAD_RADIUS;
    const sin = Math.sin(angle) * HEAD_RADIUS;
    const px = baseX + u.x * cos + v.x * sin;
    const py = baseY + u.y * cos + v.y * sin;
    const pz = baseZ + u.z * cos + v.z * sin;
    // Line from cone base ring → tip
    offset = writeVert(buf, offset, px, py, pz, r, g, b);
    offset = writeVert(buf, offset, tipX, tipY, tipZ, r, g, b);
  }

  return offset;
}

function perp(d: { x: number; y: number; z: number }) {
  // Pick a vector not parallel to d
  const ref = Math.abs(d.y) < 0.9
    ? { x: 0, y: 1, z: 0 }
    : { x: 1, y: 0, z: 0 };
  // u = cross(d, ref), normalized
  let ux = d.y * ref.z - d.z * ref.y;
  let uy = d.z * ref.x - d.x * ref.z;
  let uz = d.x * ref.y - d.y * ref.x;
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= len; uy /= len; uz /= len;
  // v = cross(d, u)
  const vx = d.y * uz - d.z * uy;
  const vy = d.z * ux - d.x * uz;
  const vz = d.x * uy - d.y * ux;
  return { u: { x: ux, y: uy, z: uz }, v: { x: vx, y: vy, z: vz } };
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
