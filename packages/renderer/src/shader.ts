import { SHADOW_FRAGMENT_WGSL } from './shadow-fragment-wgsl.js';

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

struct DirLight {
  direction: vec4<f32>,
  color: vec4<f32>,
};

struct PointLight {
  position: vec4<f32>,  // xyz=position, w=range
  color: vec4<f32>,     // rgb=color, w=intensity
};

struct SpotLight {
  position: vec4<f32>,   // xyz=position, w=range
  direction: vec4<f32>,  // xyz=direction, w=outerCos
  color: vec4<f32>,      // rgb=color, w=intensity
  extra: vec4<f32>,      // x=innerCos
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
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var albedoSampler: sampler;
@group(1) @binding(4) var normalMap: texture_2d<f32>;
@group(1) @binding(5) var normalSampler: sampler;
@group(1) @binding(6) var metallicRoughnessMap: texture_2d<f32>;
@group(1) @binding(7) var mrSampler: sampler;

` + SHADOW_FRAGMENT_WGSL + /* wgsl */`

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

// GGX/Trowbridge-Reitz normal distribution
fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom);
}

// Schlick-GGX geometry function
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

// Smith's geometry function
fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

// Fresnel-Schlick approximation
fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Compute PBR contribution from a single light direction
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

// Compute cotangent-frame TBN from screen-space derivatives
fn computeTBN(worldPos: vec3<f32>, worldNormal: vec3<f32>, uv: vec2<f32>) -> mat3x3<f32> {
  let dp1 = dpdx(worldPos);
  let dp2 = dpdy(worldPos);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);
  let T = normalize(dp1 * duv2.y - dp2 * duv1.y);
  let B = normalize(dp2 * duv1.x - dp1 * duv2.x);
  let N = normalize(worldNormal);
  return mat3x3(T, B, N);
}

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

  var Lo = vec3<f32>(0.0);

  // Directional lights
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

  // Point lights
  for (var i = 0u; i < scene.numPointLights; i = i + 1u) {
    let light = scene.pointLights[i];
    let lightPos = light.position.xyz;
    let range = light.position.w;
    let intensity = light.color.w;

    let toLight = lightPos - input.worldPosition;
    let dist = length(toLight);
    let L = toLight / max(dist, 0.0001);

    // Smooth distance attenuation with range cutoff
    let attenuation = max(1.0 - (dist * dist) / (range * range), 0.0);
    let radiance = light.color.rgb * intensity * attenuation * attenuation;

    var contribution = computePBR(N, V, L, albedo, metallic, roughness, F0, radiance);
    let pointSlot = shadow.pointLightToSlot[i];
    if (pointSlot != 0xFFFFFFFFu) {
      contribution = contribution * samplePointShadow(pointSlot, input.worldPosition, N);
    }
    Lo = Lo + contribution;
  }

  // Spot lights
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

    // Distance attenuation (same as point light)
    let distAtt = max(1.0 - (dist * dist) / (range * range), 0.0);

    // Cone attenuation: smoothstep between outer and inner cosines
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

  // Ambient
  let ambient = vec3<f32>(0.03) * albedo;
  var color = ambient + Lo;

  // Emissive
  color = color + material.emissive.rgb * material.emissive.w;

  // Distance fog
  if (scene.fogEnabled != 0u) {
    let fogDist = length(scene.cameraPos.xyz - input.worldPosition);
    var fogFactor: f32;
    if (scene.fogMode == 0u) {
      // Linear
      fogFactor = saturate((scene.fogEnd - fogDist) / (scene.fogEnd - scene.fogStart));
    } else {
      // Exponential²
      let d = scene.fogDensity * fogDist;
      fogFactor = exp(-(d * d));
    }
    color = mix(scene.fogColor.rgb, color, fogFactor);
  }

  // Output linear HDR (tonemapping done in post-process)
  return vec4<f32>(color, alpha);
}
`;
