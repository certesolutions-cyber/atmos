/**
 * WGSL shaders for instanced tree rendering with wind animation.
 *
 * Vertex: 2-slot input (per-vertex + per-instance), wind displacement.
 * Fragment: PBR with alpha-test for leaves, double-sided normals.
 * Shadow: wind displacement for synced shadow animation.
 */

import {
  SCENE_STRUCTS_WGSL,
  PBR_FUNCTIONS_WGSL,
  LIGHT_LOOP_WGSL,
  FOG_WGSL,
  SHADOW_FRAGMENT_WGSL,
} from '@certe/atmos-renderer';

/* ── Shared wind function ───────────────────────────────────────────── */

const WIND_WGSL = /* wgsl */`
fn computeWind(worldPos: vec3<f32>, windWeight: f32, branchLevel: f32,
               windDir: vec3<f32>, windStrength: f32, phase: f32,
               anchorX: f32) -> vec3<f32> {
  // Layer 1: trunk sway (low frequency)
  let trunkSway = sin(phase * 0.8) * 0.3 * windStrength * windWeight;

  // Layer 2: branch oscillation (medium frequency)
  let branchOsc = sin(phase * 2.3 + branchLevel * 3.14159) * 0.15 * windStrength * branchLevel * windWeight;

  // Layer 3: leaf flutter (high frequency) — use anchor (instance X) for spatial variation
  // so all vertices of one leaf get the same flutter offset
  let leafFlutter = sin(phase * 5.7 + anchorX * 0.5) * 0.08 * smoothstep(0.7, 1.0, branchLevel);

  let total = (trunkSway + branchOsc + leafFlutter) * windWeight;
  return windDir * total;
}
`;

/* ── Trunk vertex shader ────────────────────────────────────────────── */

export const TREE_TRUNK_VERTEX_SHADER = /* wgsl */`
struct DrawUniforms {
  viewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
  windDirection: vec4<f32>,
};

@group(0) @binding(0) var<uniform> draw: DrawUniforms;

struct VertexInput {
  // Per-vertex (slot 0)
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) windWeight: f32,
  @location(4) branchLevel: f32,
  // Per-instance (slot 1)
  @location(5) instPos: vec3<f32>,
  @location(6) instRotY: f32,
  @location(7) instScale: f32,
  @location(8) windPhase: f32,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

` + WIND_WGSL + /* wgsl */`

@vertex
fn main(input: VertexInput) -> VertexOutput {
  let cosR = cos(input.instRotY);
  let sinR = sin(input.instRotY);

  // Rotate + scale local position
  var localPos = input.position * input.instScale;
  let rx = localPos.x * cosR - localPos.z * sinR;
  let rz = localPos.x * sinR + localPos.z * cosR;
  localPos = vec3(rx, localPos.y, rz);

  // World position
  var worldPos = localPos + input.instPos;

  // Wind displacement
  let time = draw.cameraPos.w;
  let phase = time + input.windPhase;
  let windDir = normalize(draw.windDirection.xyz);
  let windStrength = draw.windDirection.w;
  worldPos = worldPos + computeWind(worldPos, input.windWeight, input.branchLevel, windDir, windStrength, phase, input.instPos.x);

  // Rotate normal
  var localNormal = input.normal;
  let rnx = localNormal.x * cosR - localNormal.z * sinR;
  let rnz = localNormal.x * sinR + localNormal.z * cosR;
  localNormal = vec3(rnx, localNormal.y, rnz);

  var output: VertexOutput;
  output.clipPosition = draw.viewProj * vec4(worldPos, 1.0);
  output.worldPosition = worldPos;
  output.worldNormal = localNormal;
  output.uv = input.uv;
  return output;
}
`;

/* ── Leaf vertex shader (same as trunk) ─────────────────────────────── */

export const TREE_LEAF_VERTEX_SHADER = TREE_TRUNK_VERTEX_SHADER;

/* ── Trunk fragment shader (PBR) ────────────────────────────────────── */

export const TREE_TRUNK_FRAGMENT_SHADER = /* wgsl */`
const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;

struct MaterialUniforms {
  albedo: vec4<f32>,
  metallic: f32,
  roughness: f32,
  _pad0: f32,
  _pad1: f32,
  emissive: vec4<f32>,
};

` + SCENE_STRUCTS_WGSL + /* wgsl */`

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var albedoSampler: sampler;
@group(1) @binding(4) var normalMap: texture_2d<f32>;
@group(1) @binding(5) var normalSampler: sampler;

` + SHADOW_FRAGMENT_WGSL + PBR_FUNCTIONS_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let texColor = textureSample(albedoTexture, albedoSampler, input.uv);
  let albedo = material.albedo.rgb * texColor.rgb;

  let metallic = material.metallic;
  let roughness = material.roughness;
  let TBN = computeTBN(input.worldPosition, input.worldNormal, input.uv);
  let normalSample = textureSample(normalMap, normalSampler, input.uv).rgb * 2.0 - 1.0;
  let N = normalize(TBN * normalSample);
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

/* ── Leaf fragment shader (PBR + alpha test + double-sided) ─────────── */

export const TREE_LEAF_FRAGMENT_SHADER = /* wgsl */`
const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;

struct MaterialUniforms {
  albedo: vec4<f32>,
  metallic: f32,
  roughness: f32,
  _pad0: f32,
  _pad1: f32,
  emissive: vec4<f32>,
};

` + SCENE_STRUCTS_WGSL + /* wgsl */`

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var albedoSampler: sampler;
@group(1) @binding(4) var normalMap: texture_2d<f32>;
@group(1) @binding(5) var normalSampler: sampler;

` + SHADOW_FRAGMENT_WGSL + PBR_FUNCTIONS_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @builtin(front_facing) frontFacing: bool,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let texColor = textureSample(albedoTexture, albedoSampler, input.uv);

  // Alpha test
  if (texColor.a < 0.5) { discard; }

  let albedo = material.albedo.rgb * texColor.rgb;
  let metallic = material.metallic;
  let roughness = material.roughness;

  // Double-sided normal with normal map
  var geomN = normalize(input.worldNormal);
  if (!input.frontFacing) { geomN = -geomN; }
  let TBN = computeTBN(input.worldPosition, geomN, input.uv);
  let normalSample = textureSample(normalMap, normalSampler, input.uv).rgb * 2.0 - 1.0;
  let N = normalize(TBN * normalSample);

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

/* ── Shadow vertex shader (trunk) ───────────────────────────────────── */

export const TREE_SHADOW_VERTEX_SHADER = /* wgsl */`
struct DrawUniforms {
  viewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
  windDirection: vec4<f32>,
};

@group(0) @binding(0) var<uniform> draw: DrawUniforms;
@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) windWeight: f32,
  @location(4) branchLevel: f32,
  @location(5) instPos: vec3<f32>,
  @location(6) instRotY: f32,
  @location(7) instScale: f32,
  @location(8) windPhase: f32,
};

` + WIND_WGSL + /* wgsl */`

@vertex
fn main(input: VertexInput) -> @builtin(position) vec4<f32> {
  let cosR = cos(input.instRotY);
  let sinR = sin(input.instRotY);

  var localPos = input.position * input.instScale;
  let rx = localPos.x * cosR - localPos.z * sinR;
  let rz = localPos.x * sinR + localPos.z * cosR;
  localPos = vec3(rx, localPos.y, rz);

  var worldPos = localPos + input.instPos;

  let time = draw.cameraPos.w;
  let phase = time + input.windPhase;
  let windDir = normalize(draw.windDirection.xyz);
  let windStrength = draw.windDirection.w;
  worldPos = worldPos + computeWind(worldPos, input.windWeight, input.branchLevel, windDir, windStrength, phase, input.instPos.x);

  return lightVP * vec4(worldPos, 1.0);
}
`;

/* ── Shadow fragment for leaves (alpha test) ────────────────────────── */

export const TREE_LEAF_SHADOW_FRAGMENT_SHADER = /* wgsl */`
@group(0) @binding(1) var leafTexture: texture_2d<f32>;
@group(0) @binding(2) var leafSampler: sampler;

@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let texColor = textureSample(leafTexture, leafSampler, uv);
  if (texColor.a < 0.5) { discard; }
  return vec4(0.0, 0.0, 0.0, 1.0);
}
`;

/* ── Shadow vertex shader for leaves (passes UV) ────────────────────── */

export const TREE_LEAF_SHADOW_VERTEX_SHADER = /* wgsl */`
struct DrawUniforms {
  viewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
  windDirection: vec4<f32>,
};

@group(0) @binding(0) var<uniform> draw: DrawUniforms;
@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) windWeight: f32,
  @location(4) branchLevel: f32,
  @location(5) instPos: vec3<f32>,
  @location(6) instRotY: f32,
  @location(7) instScale: f32,
  @location(8) windPhase: f32,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

` + WIND_WGSL + /* wgsl */`

@vertex
fn main(input: VertexInput) -> VertexOutput {
  let cosR = cos(input.instRotY);
  let sinR = sin(input.instRotY);

  var localPos = input.position * input.instScale;
  let rx = localPos.x * cosR - localPos.z * sinR;
  let rz = localPos.x * sinR + localPos.z * cosR;
  localPos = vec3(rx, localPos.y, rz);

  var worldPos = localPos + input.instPos;

  let time = draw.cameraPos.w;
  let phase = time + input.windPhase;
  let windDir = normalize(draw.windDirection.xyz);
  let windStrength = draw.windDirection.w;
  worldPos = worldPos + computeWind(worldPos, input.windWeight, input.branchLevel, windDir, windStrength, phase, input.instPos.x);

  var output: VertexOutput;
  output.clipPosition = lightVP * vec4(worldPos, 1.0);
  output.uv = input.uv;
  return output;
}
`;
