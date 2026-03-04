/**
 * WGSL shaders for geometry clipmap terrain.
 *
 * Vertex shader: samples R32Float heightmap to displace Y, computes normals
 * from central differences, applies LOD morphing at ring boundaries.
 *
 * Fragment shader: PBR lighting with world-space UV tiling (reuses engine PBR).
 *
 * Shadow vertex shader: height displacement only, no normals/fragment.
 */

import {
  SCENE_STRUCTS_WGSL,
  PBR_FUNCTIONS_WGSL,
  LIGHT_LOOP_WGSL,
  FOG_WGSL,
  SHADOW_FRAGMENT_WGSL,
} from '@certe/atmos-renderer';

/* ── Clipmap vertex shader ──────────────────────────────────────────── */

export const CLIPMAP_VERTEX_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
};

struct LevelUniforms {
  originX: f32,
  originZ: f32,
  scale: f32,
  gridSize: f32,
  texelSize: f32,
  hmWorldSize: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;
@group(0) @binding(1) var<uniform> level: LevelUniforms;
@group(0) @binding(2) var heightmap: texture_2d<f32>;

struct VertexInput {
  @location(0) gridCoord: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

// Manual bilinear interpolation (r32float doesn't support filtering)
fn sampleHeight(worldX: f32, worldZ: f32) -> f32 {
  let halfSize = level.hmWorldSize * 0.5;
  let res = f32(textureDimensions(heightmap, 0).x);
  let texX = (worldX + halfSize) / level.hmWorldSize * res - 0.5;
  let texZ = (worldZ + halfSize) / level.hmWorldSize * res - 0.5;
  let ix = i32(floor(texX));
  let iz = i32(floor(texZ));
  let fx = texX - floor(texX);
  let fz = texZ - floor(texZ);
  let maxI = i32(res) - 1;
  let x0 = clamp(ix, 0, maxI);
  let x1 = clamp(ix + 1, 0, maxI);
  let z0 = clamp(iz, 0, maxI);
  let z1 = clamp(iz + 1, 0, maxI);
  let h00 = textureLoad(heightmap, vec2(x0, z0), 0).r;
  let h10 = textureLoad(heightmap, vec2(x1, z0), 0).r;
  let h01 = textureLoad(heightmap, vec2(x0, z1), 0).r;
  let h11 = textureLoad(heightmap, vec2(x1, z1), 0).r;
  let a = mix(h00, h10, fx);
  let b = mix(h01, h11, fx);
  return mix(a, b, fz);
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  let worldX = level.originX + input.gridCoord.x * level.scale;
  let worldZ = level.originZ + input.gridCoord.y * level.scale;

  // Sample heightmap
  let height = sampleHeight(worldX, worldZ);

  // Normal from central differences
  let eps = level.scale;
  let hL = sampleHeight(worldX - eps, worldZ);
  let hR = sampleHeight(worldX + eps, worldZ);
  let hD = sampleHeight(worldX, worldZ - eps);
  let hU = sampleHeight(worldX, worldZ + eps);
  let normal = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

  let worldPos = vec3(worldX, height, worldZ);
  var output: VertexOutput;
  output.clipPosition = object.mvp * vec4(worldPos, 1.0);
  output.worldPosition = (object.model * vec4(worldPos, 1.0)).xyz;
  output.worldNormal = (object.model * vec4(normal, 0.0)).xyz;
  output.uv = vec2(worldX, worldZ);
  return output;
}
`;

/* ── Clipmap fragment shader (PBR) ──────────────────────────────────── */

export const CLIPMAP_FRAGMENT_SHADER = /* wgsl */`
const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;

struct MaterialUniforms {
  albedo: vec4<f32>,
  metallic: f32,
  roughness: f32,
  texTilingX: f32,
  texTilingZ: f32,
  emissive: vec4<f32>,
};

` + SCENE_STRUCTS_WGSL + /* wgsl */`

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var albedoSampler: sampler;

` + SHADOW_FRAGMENT_WGSL + PBR_FUNCTIONS_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let tiledUV = vec2(input.uv.x * material.texTilingX, input.uv.y * material.texTilingZ);
  let texColor = textureSample(albedoTexture, albedoSampler, tiledUV);
  let albedo = material.albedo.rgb * texColor.rgb;

  let metallic = material.metallic;
  let roughness = material.roughness;
  let N = normalize(input.worldNormal);
  let V = normalize(scene.cameraPos.xyz - input.worldPosition);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let worldPosition = input.worldPosition;

  var Lo = vec3<f32>(0.0);
` + LIGHT_LOOP_WGSL + /* wgsl */`
  let ambient = vec3<f32>(0.03) * albedo;
  var color = ambient + Lo;
  color = color + material.emissive.rgb * material.emissive.w;

` + FOG_WGSL + /* wgsl */`

  return vec4<f32>(color, 1.0);
}
`;

/* ── Clipmap shadow vertex shader ───────────────────────────────────── */

export const CLIPMAP_SHADOW_VERTEX_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
};

struct LevelUniforms {
  originX: f32,
  originZ: f32,
  scale: f32,
  gridSize: f32,
  texelSize: f32,
  hmWorldSize: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;
@group(0) @binding(1) var<uniform> level: LevelUniforms;
@group(0) @binding(2) var heightmap: texture_2d<f32>;
@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>;

fn sampleHeight(worldX: f32, worldZ: f32) -> f32 {
  let halfSize = level.hmWorldSize * 0.5;
  let res = f32(textureDimensions(heightmap, 0).x);
  let texX = (worldX + halfSize) / level.hmWorldSize * res - 0.5;
  let texZ = (worldZ + halfSize) / level.hmWorldSize * res - 0.5;
  let ix = i32(floor(texX));
  let iz = i32(floor(texZ));
  let fx = texX - floor(texX);
  let fz = texZ - floor(texZ);
  let maxI = i32(res) - 1;
  let x0 = clamp(ix, 0, maxI);
  let x1 = clamp(ix + 1, 0, maxI);
  let z0 = clamp(iz, 0, maxI);
  let z1 = clamp(iz + 1, 0, maxI);
  let h00 = textureLoad(heightmap, vec2(x0, z0), 0).r;
  let h10 = textureLoad(heightmap, vec2(x1, z0), 0).r;
  let h01 = textureLoad(heightmap, vec2(x0, z1), 0).r;
  let h11 = textureLoad(heightmap, vec2(x1, z1), 0).r;
  let a = mix(h00, h10, fx);
  let b = mix(h01, h11, fx);
  return mix(a, b, fz);
}

@vertex
fn main(@location(0) gridCoord: vec2<f32>) -> @builtin(position) vec4<f32> {
  let worldX = level.originX + gridCoord.x * level.scale;
  let worldZ = level.originZ + gridCoord.y * level.scale;

  let height = sampleHeight(worldX, worldZ);
  let worldPos = vec3(worldX, height, worldZ);
  return lightVP * object.model * vec4(worldPos, 1.0);
}
`;
