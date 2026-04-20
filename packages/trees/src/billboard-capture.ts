/**
 * Captures a procedural tree species from multiple angles into an impostor
 * atlas texture. 6 angles at 60° intervals around the Y axis give good
 * coverage from any horizontal viewing direction.
 *
 * The result is a GPUTextureHandle (6×CAPTURE_SIZE wide, CAPTURE_SIZE tall)
 * with premultiplied alpha, used as the billboard texture for LOD rendering.
 */

import type { GPUTextureHandle } from '@certe/atmos-renderer';
import { TREE_VERTEX_STRIDE_BYTES } from './types.js';
import type { TreeMeshData } from './types.js';
import { TREE_VERTEX_STRIDE } from './types.js';

// Billboard capture resolution per column
const CAPTURE_SIZE = 256;

/** Number of angles in the impostor atlas. */
export const IMPOSTOR_ANGLES = 6;

/* ── Minimal shaders for offscreen capture (no instancing, no wind) ── */

const CAPTURE_VERTEX = /* wgsl */`
struct Uniforms {
  viewProj: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) windWeight: f32,
  @location(4) branchLevel: f32,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.clipPosition = u.viewProj * vec4(input.position, 1.0);
  out.normal = input.normal;
  out.uv = input.uv;
  return out;
}
`;

const CAPTURE_TRUNK_FRAGMENT = /* wgsl */`
struct MaterialUniforms {
  albedo: vec4<f32>,
};
@group(1) @binding(0) var<uniform> mat: MaterialUniforms;

@fragment
fn main(
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  // Simple hemisphere lighting for a recognizable silhouette
  let n = normalize(normal);
  let lightDir = normalize(vec3(0.3, 1.0, 0.5));
  let ndl = max(dot(n, lightDir), 0.0);
  let ambient = 0.4;
  let lit = ambient + (1.0 - ambient) * ndl;
  return vec4(mat.albedo.rgb * lit, 1.0);
}
`;

const CAPTURE_LEAF_FRAGMENT = /* wgsl */`
struct MaterialUniforms {
  albedo: vec4<f32>,
};
@group(1) @binding(0) var<uniform> mat: MaterialUniforms;
@group(1) @binding(1) var leafTex: texture_2d<f32>;
@group(1) @binding(2) var leafSampler: sampler;

@fragment
fn main(
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let texColor = textureSample(leafTex, leafSampler, uv);
  if (texColor.a < 0.5) { discard; }
  let n = normalize(normal);
  let lightDir = normalize(vec3(0.3, 1.0, 0.5));
  let ndl = max(dot(n, lightDir), 0.0);
  let ambient = 0.4;
  let lit = ambient + (1.0 - ambient) * ndl;
  return vec4(mat.albedo.rgb * texColor.rgb * lit, texColor.a);
}
`;

/** Vertex buffer layout — same as main tree pipeline but vertex-only (no instance slot). */
const CAPTURE_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: TREE_VERTEX_STRIDE_BYTES,
  stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },   // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' },  // normal
    { shaderLocation: 2, offset: 24, format: 'float32x2' },  // uv
    { shaderLocation: 3, offset: 32, format: 'float32' },    // windWeight
    { shaderLocation: 4, offset: 36, format: 'float32' },    // branchLevel
  ],
};

/** Compute axis-aligned bounding box from tree mesh vertex data. */
export function computeAABB(vertices: Float32Array, stride: number): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += stride) {
    const x = vertices[i]!;
    const y = vertices[i + 1]!;
    const z = vertices[i + 2]!;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

/** Build an orthographic projection matrix (column-major Float32Array). */
function ortho(
  left: number, right: number, bottom: number, top: number,
  near: number, far: number,
): Float32Array {
  const m = new Float32Array(16);
  const rl = 1 / (right - left);
  const tb = 1 / (top - bottom);
  const fn = 1 / (far - near);
  m[0] = 2 * rl;
  m[5] = 2 * tb;
  m[10] = -fn;     // map [near,far] → [0,1] (WebGPU NDC)
  m[12] = -(right + left) * rl;
  m[13] = -(top + bottom) * tb;
  m[14] = -near * fn;
  m[15] = 1;
  return m;
}

/** Multiply two column-major 4×4 matrices: out = a × b. */
function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row]! * b[col * 4]! +
        a[4 + row]! * b[col * 4 + 1]! +
        a[8 + row]! * b[col * 4 + 2]! +
        a[12 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

/** Create a Y-axis rotation matrix (column-major). */
function rotateYMat(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = new Float32Array(16);
  m[0] = c;   m[2] = s;
  m[5] = 1;
  m[8] = -s;  m[10] = c;
  m[15] = 1;
  return m;
}

/** Cached capture pipelines per device (lazy). */
interface CapturePipelines {
  trunkPipeline: GPURenderPipeline;
  leafPipeline: GPURenderPipeline;
  uniformBGL: GPUBindGroupLayout;
  trunkMatBGL: GPUBindGroupLayout;
  leafMatBGL: GPUBindGroupLayout;
}

const _pipelineCache = new WeakMap<GPUDevice, CapturePipelines>();

function getCapturePipelines(device: GPUDevice): CapturePipelines {
  const cached = _pipelineCache.get(device);
  if (cached) return cached;

  const uniformBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const trunkMatBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const leafMatBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const trunkLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformBGL, trunkMatBGL] });
  const leafLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformBGL, leafMatBGL] });

  const vertModule = device.createShaderModule({ code: CAPTURE_VERTEX });
  const trunkFragModule = device.createShaderModule({ code: CAPTURE_TRUNK_FRAGMENT });
  const leafFragModule = device.createShaderModule({ code: CAPTURE_LEAF_FRAGMENT });

  const depthStencil: GPUDepthStencilState = {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus',
  };

  const trunkPipeline = device.createRenderPipeline({
    layout: trunkLayout,
    vertex: { module: vertModule, entryPoint: 'main', buffers: [CAPTURE_VERTEX_LAYOUT] },
    fragment: {
      module: trunkFragModule, entryPoint: 'main',
      targets: [{
        format: 'rgba8unorm',
        blend: {
          color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil,
  });

  const leafPipeline = device.createRenderPipeline({
    layout: leafLayout,
    vertex: { module: vertModule, entryPoint: 'main', buffers: [CAPTURE_VERTEX_LAYOUT] },
    fragment: {
      module: leafFragModule, entryPoint: 'main',
      targets: [{
        format: 'rgba8unorm',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    // No depth test for leaves — always draw on top of trunk in billboard capture
    depthStencil: { depthWriteEnabled: false, depthCompare: 'always', format: 'depth24plus' },
  });

  const result: CapturePipelines = { trunkPipeline, leafPipeline, uniformBGL, trunkMatBGL, leafMatBGL };
  _pipelineCache.set(device, result);
  return result;
}

/** Billboard sizing info — matches the capture ortho projection exactly. */
export interface BillboardSizing {
  /** Square dimension for both width and height (world units). */
  dim: number;
  /** Y offset for the billboard bottom edge (usually slightly negative). */
  yOffset: number;
  /** AABB center X — billboard quad uses this offset so the trunk root aligns. */
  centerX: number;
}

/**
 * Compute billboard mesh dimensions for the impostor atlas.
 * Uses maximum radial extent (any viewing angle) and full Y range.
 */
export function computeBillboardSizing(meshData: TreeMeshData): BillboardSizing {
  let maxRadial = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const verts of [meshData.trunkVertices, meshData.leafVertices]) {
    for (let i = 0; i < verts.length; i += TREE_VERTEX_STRIDE) {
      const x = verts[i]!;
      const y = verts[i + 1]!;
      const z = verts[i + 2]!;
      const r = Math.sqrt(x * x + z * z);
      if (r > maxRadial) maxRadial = r;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minY)) { minY = 0; maxY = 1; maxRadial = 0.5; }

  const pad = 0.1;
  const width = 2 * (maxRadial + pad);
  const height = maxY - minY + pad * 2;
  const dim = Math.max(width, height);
  const cy = (minY + maxY) * 0.5;
  const yOffset = cy - dim * 0.5;

  return { dim, yOffset, centerX: 0 };
}

export interface CaptureOptions {
  /** Leaf texture handle (for textured leaves). If null, uses solid color. */
  leafTexture?: GPUTextureHandle | null;
  /** Trunk albedo color [r,g,b,a] 0-1. Default brown. */
  trunkColor?: [number, number, number, number];
  /** Leaf albedo color [r,g,b,a] 0-1. Default green. */
  leafColor?: [number, number, number, number];
  /** Capture resolution per column. Default 256. */
  size?: number;
}

/**
 * Render a tree species from 6 angles into an impostor atlas texture.
 * The atlas is 6×size wide and size tall. Each column is captured from
 * a different Y-axis rotation (0°, 60°, 120°, 180°, 240°, 300°).
 */
export function captureTreeBillboard(
  device: GPUDevice,
  meshData: TreeMeshData,
  options?: CaptureOptions,
): GPUTextureHandle {
  const size = options?.size ?? CAPTURE_SIZE;
  const atlasWidth = size * IMPOSTOR_ANGLES;
  const trunkColor = options?.trunkColor ?? [0.45, 0.3, 0.15, 1];
  const leafColor = options?.leafColor ?? [0.3, 0.6, 0.2, 1];
  const pipelines = getCapturePipelines(device);

  // Compute radial extent and Y range across all vertices
  let maxRadial = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const verts of [meshData.trunkVertices, meshData.leafVertices]) {
    for (let i = 0; i < verts.length; i += TREE_VERTEX_STRIDE) {
      const x = verts[i]!;
      const y = verts[i + 1]!;
      const z = verts[i + 2]!;
      const r = Math.sqrt(x * x + z * z);
      if (r > maxRadial) maxRadial = r;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minY)) { minY = 0; maxY = 1; maxRadial = 0.5; }

  const pad = 0.1;
  const width = 2 * (maxRadial + pad);
  const height = maxY - minY + pad * 2;
  const dim = Math.max(width, height);
  const halfDim = dim * 0.5;
  const cy = (minY + maxY) * 0.5;
  const maxDepth = maxRadial + 1;

  // Base ortho centered on (0, cy), Y-flipped for correct UV orientation
  const baseOrtho = ortho(-halfDim, halfDim, cy + halfDim, cy - halfDim, -maxDepth, maxDepth);

  // Create per-angle uniform buffers and bind groups
  const uniformBufs: GPUBuffer[] = [];
  const uniformBGs: GPUBindGroup[] = [];
  for (let col = 0; col < IMPOSTOR_ANGLES; col++) {
    // Negate angle: column i should show the tree as seen from +i*60°,
    // so rotate vertices by -i*60° (equivalent to camera orbiting +i*60°)
    const angle = -(col * (Math.PI * 2 / IMPOSTOR_ANGLES));
    const rot = rotateYMat(angle);
    const viewProj = mat4Mul(baseOrtho, rot);

    const buf = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, viewProj as GPUAllowSharedBufferSource);
    uniformBufs.push(buf);

    uniformBGs.push(device.createBindGroup({
      layout: pipelines.uniformBGL,
      entries: [{ binding: 0, resource: { buffer: buf } }],
    }));
  }

  // Material UBOs
  const trunkMatBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(trunkMatBuf, 0, new Float32Array(trunkColor) as GPUAllowSharedBufferSource);
  const leafMatBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(leafMatBuf, 0, new Float32Array(leafColor) as GPUAllowSharedBufferSource);

  const trunkMatBG = device.createBindGroup({
    layout: pipelines.trunkMatBGL,
    entries: [{ binding: 0, resource: { buffer: trunkMatBuf } }],
  });

  // Leaf material bind group — with or without texture
  let leafMatBG: GPUBindGroup;
  if (options?.leafTexture) {
    leafMatBG = device.createBindGroup({
      layout: pipelines.leafMatBGL,
      entries: [
        { binding: 0, resource: { buffer: leafMatBuf } },
        { binding: 1, resource: options.leafTexture.view },
        { binding: 2, resource: options.leafTexture.sampler },
      ],
    });
  } else {
    // Create 1x1 white fallback
    const whiteTex = device.createTexture({
      size: [1, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: whiteTex },
      new Uint8Array([255, 255, 255, 255]) as GPUAllowSharedBufferSource,
      { bytesPerRow: 4 }, [1, 1],
    );
    const whiteView = whiteTex.createView();
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    leafMatBG = device.createBindGroup({
      layout: pipelines.leafMatBGL,
      entries: [
        { binding: 0, resource: { buffer: leafMatBuf } },
        { binding: 1, resource: whiteView },
        { binding: 2, resource: sampler },
      ],
    });
  }

  // Create GPU meshes from raw vertex/index data
  const trunkVB = device.createBuffer({
    size: meshData.trunkVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(trunkVB, 0, meshData.trunkVertices as GPUAllowSharedBufferSource);
  const trunkIB = device.createBuffer({
    size: meshData.trunkIndices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(trunkIB, 0, meshData.trunkIndices as GPUAllowSharedBufferSource);

  const leafVB = device.createBuffer({
    size: meshData.leafVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(leafVB, 0, meshData.leafVertices as GPUAllowSharedBufferSource);
  const leafIB = device.createBuffer({
    size: meshData.leafIndices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(leafIB, 0, meshData.leafIndices as GPUAllowSharedBufferSource);

  // Create render targets: atlas-wide color + depth
  const colorTex = device.createTexture({
    size: [atlasWidth, size],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const depthTex = device.createTexture({
    size: [atlasWidth, size],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Render each angle into its atlas column
  const encoder = device.createCommandEncoder();

  for (let col = 0; col < IMPOSTOR_ANGLES; col++) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorTex.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: col === 0 ? 'clear' : 'load',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTex.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setViewport(col * size, 0, size, size, 0, 1);

    // Draw trunk
    if (meshData.trunkIndices.length > 0) {
      pass.setPipeline(pipelines.trunkPipeline);
      pass.setBindGroup(0, uniformBGs[col]!);
      pass.setBindGroup(1, trunkMatBG);
      pass.setVertexBuffer(0, trunkVB);
      pass.setIndexBuffer(trunkIB, 'uint32');
      pass.drawIndexed(meshData.trunkIndices.length);
    }

    // Draw leaves
    if (meshData.leafIndices.length > 0) {
      pass.setPipeline(pipelines.leafPipeline);
      pass.setBindGroup(0, uniformBGs[col]!);
      pass.setBindGroup(1, leafMatBG);
      pass.setVertexBuffer(0, leafVB);
      pass.setIndexBuffer(leafIB, 'uint32');
      pass.drawIndexed(meshData.leafIndices.length);
    }

    pass.end();
  }

  device.queue.submit([encoder.finish()]);

  // Clean up temp buffers
  for (const buf of uniformBufs) buf.destroy();
  trunkMatBuf.destroy();
  leafMatBuf.destroy();
  trunkVB.destroy();
  trunkIB.destroy();
  leafVB.destroy();
  leafIB.destroy();
  depthTex.destroy();

  // Return as GPUTextureHandle
  const view = colorTex.createView();
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  return { texture: colorTex, view, sampler };
}
