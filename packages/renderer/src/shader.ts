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

struct ShadowUniforms {
  cascade0VP: mat4x4<f32>,
  cascade1VP: mat4x4<f32>,
  dirShadowBias: f32,
  dirShadowEnabled: u32,
  pointShadowBias: f32,
  pointShadowEnabled: u32,
  pointLightPos: vec4<f32>,
  dirShadowIntensity: f32,
  pointShadowIntensity: f32,
  cascadeSplit: f32,
  cascadeBlendWidth: f32,
  spotShadowVP: mat4x4<f32>,
  spotLightPosAndFar: vec4<f32>,
  spotShadowBias: f32,
  spotShadowEnabled: u32,
  spotShadowIntensity: f32,
  _spotPad: f32,
};

@group(2) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(2) @binding(1) var shadowMap0: texture_depth_2d;
@group(2) @binding(2) var shadowSampler: sampler_comparison;
@group(2) @binding(3) var pointShadowMap: texture_depth_cube;
@group(2) @binding(4) var shadowMap1: texture_depth_2d;
@group(2) @binding(5) var spotShadowMap: texture_depth_2d;

fn pcfCascade0(worldPos: vec3<f32>) -> f32 {
  let clip = shadow.cascade0VP * vec4<f32>(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = ndc.xy * vec2(0.5, -0.5) + 0.5;
  let depth = ndc.z - shadow.dirShadowBias;
  let texelSize = 1.0 / f32(textureDimensions(shadowMap0, 0).x);
  var vis = 0.0;
  for (var y: i32 = -1; y <= 1; y++) { for (var x: i32 = -1; x <= 1; x++) {
    vis += textureSampleCompare(shadowMap0, shadowSampler, uv + vec2(f32(x), f32(y)) * texelSize, depth);
  }}
  return vis / 9.0;
}

fn pcfCascade1(worldPos: vec3<f32>) -> f32 {
  let clip = shadow.cascade1VP * vec4<f32>(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = ndc.xy * vec2(0.5, -0.5) + 0.5;
  let depth = ndc.z - shadow.dirShadowBias;
  let texelSize = 1.0 / f32(textureDimensions(shadowMap1, 0).x);
  var vis = 0.0;
  for (var y: i32 = -1; y <= 1; y++) { for (var x: i32 = -1; x <= 1; x++) {
    vis += textureSampleCompare(shadowMap1, shadowSampler, uv + vec2(f32(x), f32(y)) * texelSize, depth);
  }}
  return vis / 9.0;
}

fn cascadeUV(worldPos: vec3<f32>, lightVP: mat4x4<f32>) -> vec3<f32> {
  let clip = lightVP * vec4(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  return vec3(ndc.xy * vec2(0.5, -0.5) + 0.5, ndc.z);
}

// XY-only coverage (no depth fade) — for cascade 0 → 1 transition
fn cascadeCoverageXY(uv: vec2<f32>, fade: f32) -> f32 {
  let fx = min(smoothstep(0.0, fade, uv.x), smoothstep(0.0, fade, 1.0 - uv.x));
  let fy = min(smoothstep(0.0, fade, uv.y), smoothstep(0.0, fade, 1.0 - uv.y));
  return fx * fy;
}

fn sampleShadow(worldPos: vec3<f32>) -> f32 {
  // Always sample both cascades (uniform control flow)
  let vis0 = pcfCascade0(worldPos);
  let vis1 = pcfCascade1(worldPos);

  // Cascade 0: XY edge fade (5%) + sharp depth boundary (2%)
  // Depth must be a hard cutoff so cascade 0 doesn't claim "lit" for
  // fragments outside its depth range (which would override cascade 1).
  let uv0 = cascadeUV(worldPos, shadow.cascade0VP);
  let c0xy = cascadeCoverageXY(uv0.xy, 0.05);
  let c0z = smoothstep(0.0, 0.02, uv0.z) * smoothstep(0.0, 0.02, 1.0 - uv0.z);
  let c0 = c0xy * c0z;

  // Cascade 1: full coverage including depth fade at outer boundary
  let uv1 = cascadeUV(worldPos, shadow.cascade1VP);
  let c1xy = cascadeCoverageXY(uv1.xy, 0.15);
  let c1z = smoothstep(0.0, 0.15, 1.0 - uv1.z);
  let c1 = c1xy * c1z;

  // Prefer cascade 0 when it has coverage; fall back to cascade 1
  let vis1Faded = mix(1.0, vis1, c1);
  let visibility = mix(vis1Faded, vis0, c0);

  // Apply shadow intensity once
  let result = mix(1.0, visibility, shadow.dirShadowIntensity);
  let enabled = shadow.dirShadowEnabled != 0u;
  return select(1.0, result, enabled);
}

fn samplePointShadow(worldPos: vec3<f32>, N: vec3<f32>) -> f32 {
  let toFrag = worldPos - shadow.pointLightPos.xyz;
  let dist = length(toFrag);
  let far = shadow.pointLightPos.w;

  // Slope-scaled bias: increase at grazing angles to prevent acne
  let lightDir = toFrag / max(dist, 0.0001);
  let cosTheta = abs(dot(lightDir, N));
  let bias = shadow.pointShadowBias * max(1.0, 2.0 / max(cosTheta, 0.05));
  let refDepth = dist / far - bias;

  // Always sample to satisfy uniform control flow
  let vis = textureSampleCompare(pointShadowMap, shadowSampler, toFrag, refDepth);

  // Apply shadow intensity
  let adjusted = mix(1.0, vis, shadow.pointShadowIntensity);

  let enabled = shadow.pointShadowEnabled != 0u;
  let inRange = dist < far;
  return select(1.0, adjusted, enabled && inRange);
}

fn sampleSpotShadow(worldPos: vec3<f32>) -> f32 {
  let clip = shadow.spotShadowVP * vec4<f32>(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = ndc.xy * vec2(0.5, -0.5) + 0.5;
  let depth = ndc.z - shadow.spotShadowBias;

  // Out-of-frustum check
  let inBounds = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0;

  let texelSize = 1.0 / f32(textureDimensions(spotShadowMap, 0).x);
  var vis = 0.0;
  for (var y: i32 = -1; y <= 1; y++) { for (var x: i32 = -1; x <= 1; x++) {
    vis += textureSampleCompare(spotShadowMap, shadowSampler, uv + vec2(f32(x), f32(y)) * texelSize, depth);
  }}
  vis = vis / 9.0;

  let adjusted = mix(1.0, vis, shadow.spotShadowIntensity);
  let enabled = shadow.spotShadowEnabled != 0u;
  return select(1.0, adjusted, enabled && inBounds);
}

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
  let texColor = textureSample(albedoTexture, albedoSampler, input.uv);
  let alpha = texColor.a * material.albedo.a;
  if (material.alphaCutoff > 0.0 && alpha < material.alphaCutoff) {
    discard;
  }
  let albedo = material.albedo.rgb * texColor.rgb;

  // Sample metallic-roughness map (G=roughness, B=metallic per glTF convention)
  let mrSample = textureSample(metallicRoughnessMap, mrSampler, input.uv);
  let metallic = material.metallic * mrSample.b;
  let roughness = material.roughness * mrSample.g;

  // Normal mapping via cotangent-frame
  let TBN = computeTBN(input.worldPosition, input.worldNormal, input.uv);
  let normalSample = textureSample(normalMap, normalSampler, input.uv).rgb * 2.0 - 1.0;
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
    // Apply cascaded shadow from first directional light
    if (i == 0u) {
      contribution = contribution * sampleShadow(input.worldPosition);
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
    // Apply shadow from first point light
    if (i == 0u) {
      contribution = contribution * samplePointShadow(input.worldPosition, N);
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
    // Apply shadow from first spot light
    if (i == 0u) {
      contribution = contribution * sampleSpotShadow(input.worldPosition);
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
