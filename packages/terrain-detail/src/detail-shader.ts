/**
 * WGSL shaders for instanced detail billboard rendering.
 *
 * Features:
 * - Y-axis aligned billboards with random rotation
 * - Wind sway on upper vertices
 * - Dither-based distance fade (no sorting needed)
 * - Color variation per instance
 * - Alpha test
 */

import {
  SCENE_STRUCTS_WGSL,
  PBR_FUNCTIONS_WGSL,
  LIGHT_LOOP_WGSL,
  FOG_WGSL,
  SHADOW_FRAGMENT_WGSL,
} from '@certe/atmos-renderer';

/* ── Vertex shader ─────────────────────────────────────────────────── */

export const DETAIL_VERTEX_SHADER = /* wgsl */`
struct DrawUniforms {
  viewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,   // xyz = pos, w = time
  windDir: vec4<f32>,     // xyz = direction, w = strength
  fadeParams: vec4<f32>,  // x = fadeStart, y = fadeEnd, z = colorVariation, w = unused
};

@group(0) @binding(0) var<uniform> draw: DrawUniforms;

struct VertexInput {
  // Per-vertex (slot 0): billboard quad
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
  // Per-instance (slot 1)
  @location(2) instPos: vec3<f32>,
  @location(3) instRotY: f32,
  @location(4) instScale: f32,
  @location(5) instColorShift: f32,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) colorShift: f32,
  @location(3) fadeFactor: f32,
};

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

  // Wind: only affects upper part of billboard (uv.y < 0.5 = top in typical quad)
  let time = draw.cameraPos.w;
  let windWeight = 1.0 - input.uv.y; // top vertices sway, bottom anchored
  let windStrength = draw.windDir.w;
  let windDir = draw.windDir.xyz;
  let phase = time * 2.0 + input.instPos.x * 0.7 + input.instPos.z * 0.3;
  let sway = sin(phase) * 0.5 + sin(phase * 2.3 + 1.7) * 0.25;
  worldPos = worldPos + windDir * (sway * windStrength * windWeight * 0.3);

  // Distance fade factor
  let dx = worldPos.x - draw.cameraPos.x;
  let dy = worldPos.y - draw.cameraPos.y;
  let dz = worldPos.z - draw.cameraPos.z;
  let dist = sqrt(dx * dx + dy * dy + dz * dz);
  let fadeFactor = 1.0 - smoothstep(draw.fadeParams.x, draw.fadeParams.y, dist);

  var output: VertexOutput;
  output.clipPosition = draw.viewProj * vec4(worldPos, 1.0);
  output.worldPosition = worldPos;
  output.uv = input.uv;
  output.colorShift = input.instColorShift;
  output.fadeFactor = fadeFactor;
  return output;
}
`;

/* ── Fragment shader (PBR + alpha test + dither fade) ──────────────── */

export const DETAIL_FRAGMENT_SHADER = /* wgsl */`
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

` + SHADOW_FRAGMENT_WGSL + PBR_FUNCTIONS_WGSL + /* wgsl */`

// 4x4 Bayer dither matrix (normalized 0..1)
fn bayerDither4x4(pixelCoord: vec2<u32>) -> f32 {
  let bayer = array<f32, 16>(
     0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
    12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
     3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
    15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0,
  );
  let ix = pixelCoord.x % 4u;
  let iy = pixelCoord.y % 4u;
  return bayer[iy * 4u + ix];
}

struct FragmentInput {
  @builtin(position) fragCoord: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) colorShift: f32,
  @location(3) fadeFactor: f32,
  @builtin(front_facing) frontFacing: bool,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let texColor = textureSample(albedoTexture, albedoSampler, input.uv);

  // Alpha test
  if (texColor.a < 0.5) { discard; }

  // Dither fade: compare fade factor against dither threshold
  let pixCoord = vec2<u32>(u32(input.fragCoord.x), u32(input.fragCoord.y));
  let ditherVal = bayerDither4x4(pixCoord);
  if (input.fadeFactor < ditherVal) { discard; }

  // Color variation: shift hue slightly based on per-instance colorShift
  let variation = input.colorShift * 0.15;
  let tintedColor = texColor.rgb * (1.0 + vec3(variation * -0.3, variation * 0.5, variation * -0.4));
  let albedo = material.albedo.rgb * tintedColor;

  let metallic = material.metallic;
  let roughness = material.roughness;

  // Compute normal from screen-space derivatives (billboard has no mesh normals)
  let dpdx_val = dpdx(input.worldPosition);
  let dpdy_val = dpdy(input.worldPosition);
  var N = normalize(cross(dpdx_val, dpdy_val));
  if (!input.frontFacing) { N = -N; }

  let V = normalize(scene.cameraPos.xyz - input.worldPosition);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let worldPosition = input.worldPosition;

  var Lo = vec3<f32>(0.0);
` + LIGHT_LOOP_WGSL + /* wgsl */`
  let ambient = vec3<f32>(0.06) * albedo;
  var color = ambient + Lo;
  color = color + material.emissive.rgb * material.emissive.w;

` + FOG_WGSL + /* wgsl */`

  return vec4<f32>(color, 1.0);
}
`;
