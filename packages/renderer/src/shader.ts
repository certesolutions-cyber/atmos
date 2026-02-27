import { SHADOW_FRAGMENT_WGSL } from './shadow-fragment-wgsl.js';
import { PBR_FUNCTIONS_WGSL, LIGHT_LOOP_WGSL, FOG_WGSL, SCENE_STRUCTS_WGSL } from './pbr-wgsl.js';

export const VERTEX_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = object.model * vec4<f32>(input.position, 1.0);
  output.clipPosition = object.mvp * vec4<f32>(input.position, 1.0);
  output.worldPosition = worldPos.xyz;
  output.worldNormal = (object.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz;
  output.uv = input.uv;
  return output;
}
`;

export const FRAGMENT_SHADER = /* wgsl */`
const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;

struct MaterialUniforms {
  albedo: vec4<f32>,
  metallic: f32,
  roughness: f32,
  _pad0: f32,
  alphaCutoff: f32,
  emissive: vec4<f32>,  // rgb + intensity in w
  texTiling: vec2<f32>,
  _pad1: vec2<f32>,
};

` + SCENE_STRUCTS_WGSL + /* wgsl */`

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var albedoSampler: sampler;
@group(1) @binding(4) var normalMap: texture_2d<f32>;
@group(1) @binding(5) var normalSampler: sampler;
@group(1) @binding(6) var metallicRoughnessMap: texture_2d<f32>;
@group(1) @binding(7) var mrSampler: sampler;

` + SHADOW_FRAGMENT_WGSL + PBR_FUNCTIONS_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let uv = input.uv * material.texTiling;
  let texColor = textureSample(albedoTexture, albedoSampler, uv);
  let alpha = texColor.a * material.albedo.a;
  if (material.alphaCutoff > 0.0 && alpha < material.alphaCutoff) {
    discard;
  }
  let albedo = material.albedo.rgb * texColor.rgb;

  // Sample metallic-roughness map (G=roughness, B=metallic per glTF convention)
  let mrSample = textureSample(metallicRoughnessMap, mrSampler, uv);
  let metallic = material.metallic * mrSample.b;
  let roughness = material.roughness * mrSample.g;

  // Normal mapping via cotangent-frame
  let TBN = computeTBN(input.worldPosition, input.worldNormal, uv);
  let normalSample = textureSample(normalMap, normalSampler, uv).rgb * 2.0 - 1.0;
  let N = normalize(TBN * normalSample);

  let V = normalize(scene.cameraPos.xyz - input.worldPosition);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let worldPosition = input.worldPosition;

  var Lo = vec3<f32>(0.0);
` + LIGHT_LOOP_WGSL + /* wgsl */`
  // Ambient
  let ambient = vec3<f32>(0.03) * albedo;
  var color = ambient + Lo;

  // Emissive
  color = color + material.emissive.rgb * material.emissive.w;

` + FOG_WGSL + /* wgsl */`

  // Output linear HDR (tonemapping done in post-process)
  return vec4<f32>(color, alpha);
}
`;
