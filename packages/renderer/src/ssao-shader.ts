/**
 * WGSL shaders for Screen-Space Ambient Occlusion.
 * SSAO pass: hemisphere sampling with depth-reconstructed normals.
 * Blur pass: bilateral blur to smooth the noisy AO result.
 */

import { FULLSCREEN_VERTEX_SHADER } from './fullscreen-quad.js';

export const SSAO_KERNEL_SIZE = 16;

export const SSAO_SHADER = FULLSCREEN_VERTEX_SHADER + /* wgsl */`
const KERNEL_SIZE: u32 = 16u;

struct SSAOParams {
  invProj: mat4x4<f32>,
  proj: mat4x4<f32>,
  radius: f32,
  bias: f32,
  intensity: f32,
  _pad: f32,
  kernel: array<vec4<f32>, 16>,
};

@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var noiseTex: texture_2d<f32>;
@group(0) @binding(2) var noiseSampler: sampler;
@group(0) @binding(3) var<uniform> params: SSAOParams;

fn reconstructViewPos(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  let ndc = vec4(uv * 2.0 - 1.0, depth, 1.0);
  let viewH = params.invProj * ndc;
  return viewH.xyz / viewH.w;
}

fn sampleDepth(coord: vec2<i32>) -> f32 {
  let dims = textureDimensions(depthTexture, 0);
  let c = clamp(coord, vec2(0), vec2<i32>(dims) - vec2(1));
  return textureLoad(depthTexture, c, 0);
}

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let dims = textureDimensions(depthTexture, 0);
  let coord = vec2<i32>(uv * vec2<f32>(dims));
  let depth = sampleDepth(coord);

  // Noise for random kernel rotation (tile 4x4 noise over screen)
  // Must be called before any non-uniform control flow (WGSL requirement)
  let noiseScale = vec2<f32>(dims) / 4.0;
  let rvec = textureSample(noiseTex, noiseSampler, uv * noiseScale).xyz * 2.0 - 1.0;

  // Skip far plane (no early return to maintain uniform control flow)
  let isSky = depth >= 1.0;

  let posV = reconstructViewPos(uv, depth);

  // Reconstruct view-space normal using smallest-depth-delta method
  // to avoid dark-edge artifacts at triangle boundaries.
  let texelX = 1.0 / f32(dims.x);
  let texelY = 1.0 / f32(dims.y);
  let posL = reconstructViewPos(uv + vec2(-texelX, 0.0), sampleDepth(coord + vec2(-1, 0)));
  let posR = reconstructViewPos(uv + vec2( texelX, 0.0), sampleDepth(coord + vec2( 1, 0)));
  let posB = reconstructViewPos(uv + vec2(0.0, -texelY), sampleDepth(coord + vec2(0, -1)));
  let posT = reconstructViewPos(uv + vec2(0.0,  texelY), sampleDepth(coord + vec2(0,  1)));
  // Pick the derivative with the smaller depth discontinuity per axis
  let dxL = posV - posL;
  let dxR = posR - posV;
  let dyB = posV - posB;
  let dyT = posT - posV;
  let dx = select(dxR, dxL, abs(dxL.z) < abs(dxR.z));
  let dy = select(dyT, dyB, abs(dyB.z) < abs(dyT.z));
  let normalV = normalize(cross(dx, dy));

  // Gram-Schmidt to build TBN from normal + random vector
  let tangent = normalize(rvec - normalV * dot(rvec, normalV));
  let bitangent = cross(normalV, tangent);
  let TBN = mat3x3(tangent, bitangent, normalV);

  var occlusion = 0.0;
  for (var i = 0u; i < KERNEL_SIZE; i = i + 1u) {
    let sampleOffset = TBN * params.kernel[i].xyz;
    let samplePos = posV + sampleOffset * params.radius;

    let offset4 = params.proj * vec4(samplePos, 1.0);
    let offsetUV = (offset4.xy / offset4.w) * 0.5 + 0.5;

    let sampleCoord = vec2<i32>(offsetUV * vec2<f32>(dims));
    let sampledDepth = sampleDepth(sampleCoord);
    let samplePosZ = reconstructViewPos(offsetUV, sampledDepth).z;

    let rangeCheck = smoothstep(0.0, 1.0, params.radius / abs(posV.z - samplePosZ));
    let occluded = select(0.0, 1.0, samplePosZ >= samplePos.z + params.bias);
    occlusion = occlusion + occluded * rangeCheck;
  }

  let ao = 1.0 - (occlusion / f32(KERNEL_SIZE)) * params.intensity;
  let result = select(ao, 1.0, isSky);
  return vec4(result, result, result, 1.0);
}
`;

export const SSAO_BLUR_SHADER = FULLSCREEN_VERTEX_SHADER + /* wgsl */`
@group(0) @binding(0) var aoTexture: texture_2d<f32>;
@group(0) @binding(1) var aoSampler: sampler;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(aoTexture, 0));
  let texelSize = 1.0 / dims;

  // 4x4 box blur
  var result = 0.0;
  for (var y: i32 = -2; y <= 1; y = y + 1) {
    for (var x: i32 = -2; x <= 1; x = x + 1) {
      let offset = vec2<f32>(f32(x) + 0.5, f32(y) + 0.5) * texelSize;
      result = result + textureSample(aoTexture, aoSampler, uv + offset).r;
    }
  }
  result = result / 16.0;

  return vec4(result, result, result, 1.0);
}
`;
