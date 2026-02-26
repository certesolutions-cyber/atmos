/**
 * Shared PBR WGSL functions and light loop code.
 * Concatenated into both shader.ts (standard PBR) and terrain-shader.ts (splat PBR).
 */

/** PBR helper functions: GGX distribution, geometry, Fresnel, computePBR, computeTBN */
export const PBR_FUNCTIONS_WGSL = /* wgsl */`
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
`;

/** Light loop WGSL: iterates dir/point/spot lights with PBR + shadow sampling.
 *  Expects: N, V, albedo, metallic, roughness, F0, worldPosition in scope. Writes to Lo. */
export const LIGHT_LOOP_WGSL = /* wgsl */`
  // Directional lights
  for (var i = 0u; i < scene.numDirLights; i = i + 1u) {
    let light = scene.dirLights[i];
    let L = normalize(-light.direction.xyz);
    let intensity = light.color.w;
    let radiance = light.color.rgb * intensity;
    var contribution = computePBR(N, V, L, albedo, metallic, roughness, F0, radiance);
    let dirSlot = shadow.dirLightToSlot[i];
    if (dirSlot != 0xFFFFFFFFu) {
      contribution = contribution * sampleDirShadow(dirSlot, worldPosition);
    }
    Lo = Lo + contribution;
  }

  // Point lights
  for (var i = 0u; i < scene.numPointLights; i = i + 1u) {
    let light = scene.pointLights[i];
    let lightPos = light.position.xyz;
    let range = light.position.w;
    let intensity = light.color.w;

    let toLight = lightPos - worldPosition;
    let dist = length(toLight);
    let L = toLight / max(dist, 0.0001);

    // Smooth distance attenuation with range cutoff
    let attenuation = max(1.0 - (dist * dist) / (range * range), 0.0);
    let radiance = light.color.rgb * intensity * attenuation * attenuation;

    var contribution = computePBR(N, V, L, albedo, metallic, roughness, F0, radiance);
    let pointSlot = shadow.pointLightToSlot[i];
    if (pointSlot != 0xFFFFFFFFu) {
      contribution = contribution * samplePointShadow(pointSlot, worldPosition, N);
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

    let toLight = lightPos - worldPosition;
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
      contribution = contribution * sampleSpotShadow(spotSlot, worldPosition);
    }
    Lo = Lo + contribution;
  }
`;

/** Fog calculation WGSL. Expects: scene, worldPosition, color in scope. Modifies color. */
export const FOG_WGSL = /* wgsl */`
  // Distance fog
  if (scene.fogEnabled != 0u) {
    let fogDist = length(scene.cameraPos.xyz - worldPosition);
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
`;
