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

struct SplatmapUniforms {
  layerTiling: vec4<f32>,
  hmWorldSize: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

` + SCENE_STRUCTS_WGSL + /* wgsl */`

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var terrainSampler: sampler;
@group(1) @binding(3) var splatmapTexture: texture_2d<f32>;
@group(1) @binding(4) var<uniform> splatUniforms: SplatmapUniforms;
@group(1) @binding(5) var albedoArray: texture_2d_array<f32>;
@group(1) @binding(6) var normalArray: texture_2d_array<f32>;

` + SHADOW_FRAGMENT_WGSL + PBR_FUNCTIONS_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

// Build TBN from world normal using screen-space derivatives
fn buildTBN(N: vec3<f32>, worldPos: vec3<f32>, uv: vec2<f32>) -> mat3x3<f32> {
  let dp1 = dpdx(worldPos);
  let dp2 = dpdy(worldPos);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);
  let dp2perp = cross(dp2, N);
  let dp1perp = cross(N, dp1);
  let T = dp2perp * duv1.x + dp1perp * duv2.x;
  let B = dp2perp * duv1.y + dp1perp * duv2.y;
  let invMax = inverseSqrt(max(dot(T, T), dot(B, B)));
  return mat3x3<f32>(T * invMax, B * invMax, N);
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  // Sample splatmap using world-space UV (same mapping as heightmap)
  let halfSize = splatUniforms.hmWorldSize * 0.5;
  let splatUV = vec2(
    (input.uv.x + halfSize) / splatUniforms.hmWorldSize,
    (input.uv.y + halfSize) / splatUniforms.hmWorldSize,
  );
  let splat = textureSample(splatmapTexture, terrainSampler, splatUV);

  // Per-layer tiled UVs
  let uv0 = input.uv * splatUniforms.layerTiling.x;
  let uv1 = input.uv * splatUniforms.layerTiling.y;
  let uv2 = input.uv * splatUniforms.layerTiling.z;
  let uv3 = input.uv * splatUniforms.layerTiling.w;

  // Sample albedo per layer from texture array and blend by splatmap
  let c0 = textureSample(albedoArray, terrainSampler, uv0, 0).rgb;
  let c1 = textureSample(albedoArray, terrainSampler, uv1, 1).rgb;
  let c2 = textureSample(albedoArray, terrainSampler, uv2, 2).rgb;
  let c3 = textureSample(albedoArray, terrainSampler, uv3, 3).rgb;
  let blended = c0 * splat.r + c1 * splat.g + c2 * splat.b + c3 * splat.a;
  let albedo = material.albedo.rgb * blended;

  // Sample normals per layer from texture array and blend by splatmap
  let n0 = textureSample(normalArray, terrainSampler, uv0, 0).rgb * 2.0 - 1.0;
  let n1 = textureSample(normalArray, terrainSampler, uv1, 1).rgb * 2.0 - 1.0;
  let n2 = textureSample(normalArray, terrainSampler, uv2, 2).rgb * 2.0 - 1.0;
  let n3 = textureSample(normalArray, terrainSampler, uv3, 3).rgb * 2.0 - 1.0;
  let blendedNormal = normalize(n0 * splat.r + n1 * splat.g + n2 * splat.b + n3 * splat.a);

  // Transform blended tangent-space normal to world space via dpdx/dpdy TBN
  let geomN = normalize(input.worldNormal);
  let tbn = buildTBN(geomN, input.worldPosition, input.uv);
  let N = normalize(tbn * blendedNormal);

  let metallic = material.metallic;
  let roughness = material.roughness;
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

/* ── Clipmap SSAO erase shader ────────────────────────────────────── */
// Same vertex as shadow, plus fragment that outputs 1.0 to erase SSAO.

export const CLIPMAP_SSAO_ERASE_SHADER = /* wgsl */`
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
fn vs(@location(0) gridCoord: vec2<f32>) -> @builtin(position) vec4<f32> {
  let worldX = level.originX + gridCoord.x * level.scale;
  let worldZ = level.originZ + gridCoord.y * level.scale;
  let height = sampleHeight(worldX, worldZ);
  let worldPos = vec3(worldX, height, worldZ);
  return lightVP * object.model * vec4(worldPos, 1.0);
}

@fragment
fn fs() -> @location(0) f32 {
  return 1.0;
}
`;
