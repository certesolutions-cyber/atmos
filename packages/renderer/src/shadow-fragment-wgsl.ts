/**
 * Shared WGSL for multi-shadow sampling (group 2).
 *
 * Supports up to 2 directional (2-cascade each), 2 point (cubemap),
 * and 4 spot shadow slots.  Slot assignment is driven by CPU-side
 * light-to-slot maps written into the uniform buffer.
 *
 * Because WGSL cannot pass texture handles as function parameters,
 * each slot gets its own sampling function, and a dispatch function
 * selects the correct slot via a switch statement.
 */

/* ── constants ──────────────────────────────────────────────────── */

const MAX_DIR_SHADOW_SLOTS = 2;
const MAX_POINT_SHADOW_SLOTS = 2;
const MAX_SPOT_SHADOW_SLOTS = 4;

/* ── helpers (code-gen) ─────────────────────────────────────────── */

function genDirPcf(slot: number, cascade: 0 | 1): string {
  const tex = `dirCascade${cascade}_${slot}`;
  const vpField = cascade === 0 ? 'cascade0VP' : 'cascade1VP';
  return `fn _pcfDir${cascade}S${slot}(worldPos: vec3<f32>) -> f32 {
  let s = shadow.dirSlots[${slot}];
  let clip = s.${vpField} * vec4(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = ndc.xy * vec2(0.5, -0.5) + 0.5;
  let depth = ndc.z - s.bias;
  let texelSize = 1.0 / f32(textureDimensions(${tex}, 0).x);
  var vis = 0.0;
  for (var y: i32 = -1; y <= 1; y++) { for (var x: i32 = -1; x <= 1; x++) {
    vis += textureSampleCompare(${tex}, shadowSampler, uv + vec2(f32(x), f32(y)) * texelSize, depth);
  }}
  return vis / 9.0;
}`;
}

function genDirSlot(slot: number): string {
  return `fn _sampleDirSlot${slot}(worldPos: vec3<f32>) -> f32 {
  let s = shadow.dirSlots[${slot}];
  let vis0 = _pcfDir0S${slot}(worldPos);
  let vis1 = _pcfDir1S${slot}(worldPos);
  let uv0 = _cascadeUV(worldPos, s.cascade0VP);
  let c0xy = _cascadeCoverageXY(uv0.xy, 0.05);
  let c0z = smoothstep(0.0, 0.02, uv0.z) * smoothstep(0.0, 0.02, 1.0 - uv0.z);
  let c0 = c0xy * c0z;
  let uv1 = _cascadeUV(worldPos, s.cascade1VP);
  let c1xy = _cascadeCoverageXY(uv1.xy, 0.15);
  let c1z = smoothstep(0.0, 0.15, 1.0 - uv1.z);
  let c1 = c1xy * c1z;
  let vis1Faded = mix(1.0, vis1, c1);
  let visibility = mix(vis1Faded, vis0, c0);
  let result = mix(1.0, visibility, s.intensity);
  return select(1.0, result, s.enabled != 0u);
}`;
}

function genPointSlot(slot: number): string {
  const tex = `pointCubeMap${slot}`;
  return `fn _samplePointSlot${slot}(worldPos: vec3<f32>, N: vec3<f32>) -> f32 {
  let s = shadow.pointSlots[${slot}];
  let toFrag = worldPos - s.posAndFar.xyz;
  let dist = length(toFrag);
  let far = s.posAndFar.w;
  let lightDir = toFrag / max(dist, 0.0001);
  let cosTheta = abs(dot(lightDir, N));
  let bias = s.bias * max(1.0, 2.0 / max(cosTheta, 0.05));
  let refDepth = dist / far - bias;
  let vis = textureSampleCompare(${tex}, shadowSampler, toFrag, refDepth);
  let adjusted = mix(1.0, vis, s.intensity);
  let enabled = s.enabled != 0u;
  let inRange = dist < far;
  return select(1.0, adjusted, enabled && inRange);
}`;
}

function genSpotSlot(slot: number): string {
  const tex = `spotDepthMap${slot}`;
  return `fn _sampleSpotSlot${slot}(worldPos: vec3<f32>, N: vec3<f32>) -> f32 {
  let s = shadow.spotSlots[${slot}];
  let toFrag = worldPos - s.posAndFar.xyz;
  let dist = length(toFrag);
  let lightDir = toFrag / max(dist, 0.0001);
  let cosTheta = abs(dot(lightDir, N));
  // Normal offset in world space: scales with texel size at this distance
  let res = f32(textureDimensions(${tex}, 0).x);
  let texelWorld = dist * 2.0 / res;
  let normalOffset = N * texelWorld * max(1.0 - cosTheta, 0.1);
  let samplePos = worldPos + normalOffset;
  let clip = s.shadowVP * vec4(samplePos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = ndc.xy * vec2(0.5, -0.5) + 0.5;
  let depth = ndc.z - 0.0005;
  let inBounds = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0;
  let texelSize = 1.0 / f32(textureDimensions(${tex}, 0).x);
  var vis = 0.0;
  for (var y: i32 = -1; y <= 1; y++) { for (var x: i32 = -1; x <= 1; x++) {
    vis += textureSampleCompare(${tex}, shadowSampler, uv + vec2(f32(x), f32(y)) * texelSize, depth);
  }}
  vis = vis / 9.0;
  let adjusted = mix(1.0, vis, s.intensity);
  return select(1.0, adjusted, s.enabled != 0u && inBounds);
}`;
}

/* ── assemble ───────────────────────────────────────────────────── */

const parts: string[] = [];

// Structs
parts.push(`
struct DirShadowSlot {
  cascade0VP: mat4x4<f32>,
  cascade1VP: mat4x4<f32>,
  bias: f32,
  enabled: u32,
  intensity: f32,
  cascadeSplit: f32,
  blendWidth: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

struct PointShadowSlot {
  posAndFar: vec4<f32>,
  bias: f32,
  enabled: u32,
  intensity: f32,
  _pad: f32,
};

struct SpotShadowSlot {
  shadowVP: mat4x4<f32>,
  posAndFar: vec4<f32>,
  bias: f32,
  enabled: u32,
  intensity: f32,
  _pad: f32,
};

struct ShadowUniforms {
  dirSlots: array<DirShadowSlot, 2>,
  pointSlots: array<PointShadowSlot, 2>,
  spotSlots: array<SpotShadowSlot, 4>,
  dirLightToSlot: vec4<u32>,
  pointLightToSlot: vec4<u32>,
  spotLightToSlot: vec4<u32>,
};
`);

// Bindings (group 2)
parts.push(`
@group(2) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(2) @binding(1) var shadowSampler: sampler_comparison;
@group(2) @binding(2) var dirCascade0_0: texture_depth_2d;
@group(2) @binding(3) var dirCascade0_1: texture_depth_2d;
@group(2) @binding(4) var dirCascade1_0: texture_depth_2d;
@group(2) @binding(5) var dirCascade1_1: texture_depth_2d;
@group(2) @binding(6) var pointCubeMap0: texture_depth_cube;
@group(2) @binding(7) var pointCubeMap1: texture_depth_cube;
@group(2) @binding(8) var spotDepthMap0: texture_depth_2d;
@group(2) @binding(9) var spotDepthMap1: texture_depth_2d;
@group(2) @binding(10) var spotDepthMap2: texture_depth_2d;
@group(2) @binding(11) var spotDepthMap3: texture_depth_2d;
`);

// Shared helpers
parts.push(`
fn _cascadeUV(worldPos: vec3<f32>, lightVP: mat4x4<f32>) -> vec3<f32> {
  let clip = lightVP * vec4(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  return vec3(ndc.xy * vec2(0.5, -0.5) + 0.5, ndc.z);
}

fn _cascadeCoverageXY(uv: vec2<f32>, fade: f32) -> f32 {
  let fx = min(smoothstep(0.0, fade, uv.x), smoothstep(0.0, fade, 1.0 - uv.x));
  let fy = min(smoothstep(0.0, fade, uv.y), smoothstep(0.0, fade, 1.0 - uv.y));
  return fx * fy;
}
`);

// Per-slot dir PCF + blend
for (let s = 0; s < MAX_DIR_SHADOW_SLOTS; s++) {
  parts.push(genDirPcf(s, 0));
  parts.push(genDirPcf(s, 1));
  parts.push(genDirSlot(s));
}

// Per-slot point
for (let s = 0; s < MAX_POINT_SHADOW_SLOTS; s++) {
  parts.push(genPointSlot(s));
}

// Per-slot spot
for (let s = 0; s < MAX_SPOT_SHADOW_SLOTS; s++) {
  parts.push(genSpotSlot(s));
}

// Dispatch functions
parts.push(`
fn sampleDirShadow(slot: u32, worldPos: vec3<f32>) -> f32 {
  switch(slot) {
    case 0u: { return _sampleDirSlot0(worldPos); }
    case 1u: { return _sampleDirSlot1(worldPos); }
    default: { return 1.0; }
  }
}

fn samplePointShadow(slot: u32, worldPos: vec3<f32>, N: vec3<f32>) -> f32 {
  switch(slot) {
    case 0u: { return _samplePointSlot0(worldPos, N); }
    case 1u: { return _samplePointSlot1(worldPos, N); }
    default: { return 1.0; }
  }
}

fn sampleSpotShadow(slot: u32, worldPos: vec3<f32>, N: vec3<f32>) -> f32 {
  switch(slot) {
    case 0u: { return _sampleSpotSlot0(worldPos, N); }
    case 1u: { return _sampleSpotSlot1(worldPos, N); }
    case 2u: { return _sampleSpotSlot2(worldPos, N); }
    case 3u: { return _sampleSpotSlot3(worldPos, N); }
    default: { return 1.0; }
  }
}
`);

export const SHADOW_FRAGMENT_WGSL = parts.join('\n');
