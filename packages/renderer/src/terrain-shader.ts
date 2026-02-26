/**
 * Terrain splat-map shader: PBR lighting with 3-texture blending.
 *
 * Vertex format 40B: pos(3) + normal(3) + uv(2) + splatWeights(2) = 10 floats.
 * Fragment blends 3 albedo textures using per-vertex splat weights:
 *   w0 = grass, w1 = rock, w2 = 1 - w0 - w1 (snow/dirt).
 */

import { SHADOW_FRAGMENT_WGSL } from './shadow-fragment-wgsl.js';

export const TERRAIN_VERTEX_SHADER = /* wgsl */`
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
  @location(3) splatWeights: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) splatWeights: vec2<f32>,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = object.model * vec4<f32>(input.position, 1.0);
  output.clipPosition = object.mvp * vec4<f32>(input.position, 1.0);
  output.worldPosition = worldPos.xyz;
  output.worldNormal = (object.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz;
  output.uv = input.uv;
  output.splatWeights = input.splatWeights;
  return output;
}
`;

export const TERRAIN_FRAGMENT_SHADER = /* wgsl */`
const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;

struct MaterialUniforms {
  albedo: vec4<f32>,
  metallic: f32,
  roughness: f32,
  splatSharpness: f32,
  _pad1: f32,
  emissive: vec4<f32>,
  texTiling: vec2<f32>,
  _pad2: vec2<f32>,
};

struct DirLight {
  direction: vec4<f32>,
  color: vec4<f32>,
};

struct PointLight {
  position: vec4<f32>,
  color: vec4<f32>,
};

struct SpotLight {
  position: vec4<f32>,
  direction: vec4<f32>,
  color: vec4<f32>,
  extra: vec4<f32>,
};

struct SceneUniforms {
  cameraPos: vec4<f32>,
  numDirLights: u32,
  numPointLights: u32,
  numSpotLights: u32,
  _pad1: u32,
  dirLights: array<DirLight, 4>,
  pointLights: array<PointLight, 4>,
  spotLights: array<SpotLight, 4>,
  fogEnabled: u32,
  fogMode: u32,
  fogDensity: f32,
  fogStart: f32,
  fogEnd: f32,
  _fogPad: f32,
  fogColor: vec4<f32>,
};

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var splatTex0: texture_2d<f32>;
@group(1) @binding(3) var splatTex1: texture_2d<f32>;
@group(1) @binding(4) var splatTex2: texture_2d<f32>;
@group(1) @binding(5) var splatSampler: sampler;

` + SHADOW_FRAGMENT_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) splatWeights: vec2<f32>,
};

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom);
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn computePBR(
  N: vec3<f32>, V: vec3<f32>, L: vec3<f32>,
  albedo: vec3<f32>, metallic: f32, roughness: f32,
  F0: vec3<f32>, radiance: vec3<f32>,
) -> vec3<f32> {
  let H = normalize(V + L);
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  let specular = numerator / denominator;
  let kS = F;
  let kD = (vec3<f32>(1.0) - kS) * (1.0 - metallic);
  let NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * radiance * NdotL;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  // Blend 3 splat textures with sharpening
  let uv = input.uv * material.texTiling;
  let c0 = textureSample(splatTex0, splatSampler, uv);
  let c1 = textureSample(splatTex1, splatSampler, uv);
  let c2 = textureSample(splatTex2, splatSampler, uv);
  let rw0 = max(input.splatWeights.x, 0.0);
  let rw1 = max(input.splatWeights.y, 0.0);
  let rw2 = max(1.0 - rw0 - rw1, 0.0);
  // Sharpen: raise weights to power, then renormalize
  let sharpness = max(material.splatSharpness, 1.0);
  let sw0 = pow(rw0, sharpness);
  let sw1 = pow(rw1, sharpness);
  let sw2 = pow(rw2, sharpness);
  let wSum = sw0 + sw1 + sw2 + 0.0001;
  let w0 = sw0 / wSum;
  let w1 = sw1 / wSum;
  let w2 = sw2 / wSum;
  let texColor = c0 * w0 + c1 * w1 + c2 * w2;
  let albedo = material.albedo.rgb * texColor.rgb;

  let metallic = material.metallic;
  let roughness = material.roughness;
  let N = normalize(input.worldNormal);
  let V = normalize(scene.cameraPos.xyz - input.worldPosition);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);

  var Lo = vec3<f32>(0.0);

  for (var i = 0u; i < scene.numDirLights; i = i + 1u) {
    let light = scene.dirLights[i];
    let L = normalize(-light.direction.xyz);
    let intensity = light.color.w;
    let radiance = light.color.rgb * intensity;
    var contribution = computePBR(N, V, L, albedo, metallic, roughness, F0, radiance);
    let dirSlot = shadow.dirLightToSlot[i];
    if (dirSlot != 0xFFFFFFFFu) {
      contribution = contribution * sampleDirShadow(dirSlot, input.worldPosition);
    }
    Lo = Lo + contribution;
  }

  for (var i = 0u; i < scene.numPointLights; i = i + 1u) {
    let light = scene.pointLights[i];
    let lightPos = light.position.xyz;
    let range = light.position.w;
    let intensity = light.color.w;
    let toLight = lightPos - input.worldPosition;
    let dist = length(toLight);
    let L = toLight / max(dist, 0.0001);
    let attenuation = max(1.0 - (dist * dist) / (range * range), 0.0);
    let radiance = light.color.rgb * intensity * attenuation * attenuation;
    var contribution = computePBR(N, V, L, albedo, metallic, roughness, F0, radiance);
    let pointSlot = shadow.pointLightToSlot[i];
    if (pointSlot != 0xFFFFFFFFu) {
      contribution = contribution * samplePointShadow(pointSlot, input.worldPosition, N);
    }
    Lo = Lo + contribution;
  }

  for (var i = 0u; i < scene.numSpotLights; i = i + 1u) {
    let light = scene.spotLights[i];
    let lightPos = light.position.xyz;
    let range = light.position.w;
    let spotDir = light.direction.xyz;
    let outerCos = light.direction.w;
    let innerCos = light.extra.x;
    let intensity = light.color.w;
    let toLight = lightPos - input.worldPosition;
    let dist = length(toLight);
    let L = toLight / max(dist, 0.0001);
    let distAtt = max(1.0 - (dist * dist) / (range * range), 0.0);
    let cosAngle = dot(-L, spotDir);
    let coneAtt = smoothstep(outerCos, innerCos, cosAngle);
    let attenuation = distAtt * distAtt * coneAtt;
    let radiance = light.color.rgb * intensity * attenuation;
    var contribution = computePBR(N, V, L, albedo, metallic, roughness, F0, radiance);
    let spotSlot = shadow.spotLightToSlot[i];
    if (spotSlot != 0xFFFFFFFFu) {
      contribution = contribution * sampleSpotShadow(spotSlot, input.worldPosition);
    }
    Lo = Lo + contribution;
  }

  let ambient = vec3<f32>(0.03) * albedo;
  var color = ambient + Lo;
  color = color + material.emissive.rgb * material.emissive.w;

  if (scene.fogEnabled != 0u) {
    let fogDist = length(scene.cameraPos.xyz - input.worldPosition);
    var fogFactor: f32;
    if (scene.fogMode == 0u) {
      fogFactor = saturate((scene.fogEnd - fogDist) / (scene.fogEnd - scene.fogStart));
    } else {
      let d = scene.fogDensity * fogDist;
      fogFactor = exp(-(d * d));
    }
    color = mix(scene.fogColor.rgb, color, fogFactor);
  }

  return vec4<f32>(color, material.albedo.a);
}
`;
