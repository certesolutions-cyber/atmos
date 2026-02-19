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

struct MaterialUniforms {
  albedo: vec4<f32>,
  metallic: f32,
  roughness: f32,
};

struct SceneUniforms {
  lightDir: vec4<f32>,
  lightColor: vec4<f32>,
  cameraPos: vec4<f32>,
};

@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var albedoSampler: sampler;

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

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let texColor = textureSample(albedoTexture, albedoSampler, input.uv);
  let albedo = material.albedo.rgb * texColor.rgb;
  let metallic = material.metallic;
  let roughness = material.roughness;

  let N = normalize(input.worldNormal);
  let V = normalize(scene.cameraPos.xyz - input.worldPosition);
  let L = normalize(-scene.lightDir.xyz);
  let H = normalize(V + L);

  // F0: dielectric = 0.04, metallic = albedo
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);

  // Cook-Torrance BRDF
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  let specular = numerator / denominator;

  let kS = F;
  let kD = (vec3<f32>(1.0) - kS) * (1.0 - metallic);

  let NdotL = max(dot(N, L), 0.0);
  let lightIntensity = scene.lightColor.w;
  let radiance = scene.lightColor.rgb * lightIntensity;
  let Lo = (kD * albedo / PI + specular) * radiance * NdotL;

  // Ambient
  let ambient = vec3<f32>(0.03) * albedo;
  var color = ambient + Lo;

  // Reinhard tone mapping
  color = color / (color + vec3<f32>(1.0));

  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(color, material.albedo.a);
}
`;
