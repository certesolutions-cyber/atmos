/**
 * WGSL shaders for bloom post-processing.
 * Uses shared fullscreen triangle vertex shader.
 * Downsample applies a bright threshold on the first pass.
 * Upsample blends additively with the previous mip level.
 */

import { FULLSCREEN_VERTEX_SHADER } from './fullscreen-quad.js';

export const BLOOM_DOWNSAMPLE_SHADER = FULLSCREEN_VERTEX_SHADER + /* wgsl */`
@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: vec4<f32>; // x=threshold, y=isFirstPass

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTexture, 0));
  let texelSize = 1.0 / dims;

  // 13-tap downsampling filter (anti-firefly, from Call of Duty presentation)
  var color = textureSample(srcTexture, srcSampler, uv) * 0.125;
  color += textureSample(srcTexture, srcSampler, uv + vec2(-1.0, -1.0) * texelSize) * 0.03125;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 1.0, -1.0) * texelSize) * 0.03125;
  color += textureSample(srcTexture, srcSampler, uv + vec2(-1.0,  1.0) * texelSize) * 0.03125;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 1.0,  1.0) * texelSize) * 0.03125;

  color += textureSample(srcTexture, srcSampler, uv + vec2(-2.0,  0.0) * texelSize) * 0.0625;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 2.0,  0.0) * texelSize) * 0.0625;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 0.0, -2.0) * texelSize) * 0.0625;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 0.0,  2.0) * texelSize) * 0.0625;

  color += textureSample(srcTexture, srcSampler, uv + vec2(-2.0, -2.0) * texelSize) * 0.03125;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 2.0, -2.0) * texelSize) * 0.03125;
  color += textureSample(srcTexture, srcSampler, uv + vec2(-2.0,  2.0) * texelSize) * 0.03125;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 2.0,  2.0) * texelSize) * 0.03125;

  // Apply threshold on first pass only
  if (params.y > 0.5) {
    let brightness = max(color.r, max(color.g, color.b));
    let contribution = max(brightness - params.x, 0.0) / max(brightness, 0.0001);
    color = vec4(color.rgb * contribution, color.a);
  }

  return color;
}
`;

export const BLOOM_UPSAMPLE_SHADER = FULLSCREEN_VERTEX_SHADER + /* wgsl */`
@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: vec4<f32>; // x=radius

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTexture, 0));
  let texelSize = params.x / dims;

  // 9-tap tent filter for smooth upsampling
  var color = textureSample(srcTexture, srcSampler, uv + vec2(-1.0, -1.0) * texelSize);
  color += textureSample(srcTexture, srcSampler, uv + vec2( 0.0, -1.0) * texelSize) * 2.0;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 1.0, -1.0) * texelSize);
  color += textureSample(srcTexture, srcSampler, uv + vec2(-1.0,  0.0) * texelSize) * 2.0;
  color += textureSample(srcTexture, srcSampler, uv) * 4.0;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 1.0,  0.0) * texelSize) * 2.0;
  color += textureSample(srcTexture, srcSampler, uv + vec2(-1.0,  1.0) * texelSize);
  color += textureSample(srcTexture, srcSampler, uv + vec2( 0.0,  1.0) * texelSize) * 2.0;
  color += textureSample(srcTexture, srcSampler, uv + vec2( 1.0,  1.0) * texelSize);

  return color / 16.0;
}
`;
