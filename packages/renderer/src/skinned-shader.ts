/**
 * Skinned PBR vertex shader.
 * Reads bone matrices from a storage buffer (group 3) and applies GPU skinning.
 * Outputs the same VertexOutput as the regular PBR shader, so the FRAGMENT_SHADER is reused.
 */

export const SKINNED_VERTEX_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;
@group(3) @binding(0) var<storage, read> boneMatrices: array<mat4x4<f32>>;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) joints: vec4<u32>,
  @location(4) weights: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  // Compute skin matrix from bone weights
  let skin = boneMatrices[input.joints.x] * input.weights.x
           + boneMatrices[input.joints.y] * input.weights.y
           + boneMatrices[input.joints.z] * input.weights.z
           + boneMatrices[input.joints.w] * input.weights.w;

  let skinnedPos = skin * vec4<f32>(input.position, 1.0);
  let skinnedNormal = (skin * vec4<f32>(input.normal, 0.0)).xyz;

  let worldPos = object.model * skinnedPos;

  var output: VertexOutput;
  output.clipPosition = object.mvp * skinnedPos;
  output.worldPosition = worldPos.xyz;
  output.worldNormal = (object.normalMatrix * vec4<f32>(skinnedNormal, 0.0)).xyz;
  output.uv = input.uv;
  return output;
}
`;
