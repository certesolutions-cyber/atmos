/**
 * Depth-only vertex shader for skinned shadow passes.
 * Applies bone skinning before the lightVP transform. No fragment shader (depth-only).
 */

export const SKINNED_SHADOW_VERTEX_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>;
@group(2) @binding(0) var<storage, read> boneMatrices: array<mat4x4<f32>>;

@vertex
fn main(
  @location(0) position: vec3<f32>,
  @location(3) joints: vec4<u32>,
  @location(4) weights: vec4<f32>,
) -> @builtin(position) vec4<f32> {
  let skin = boneMatrices[joints.x] * weights.x
           + boneMatrices[joints.y] * weights.y
           + boneMatrices[joints.z] * weights.z
           + boneMatrices[joints.w] * weights.w;

  let skinnedPos = skin * vec4<f32>(position, 1.0);
  return lightVP * object.model * skinnedPos;
}
`;
