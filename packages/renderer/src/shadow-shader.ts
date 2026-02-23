/**
 * Depth-only vertex shader for shadow passes.
 *
 * Reads object.model from group 0 (the per-object uniform buffer, offset 64)
 * and multiplies by lightVP from group 1. No fragment shader — depth-only pipeline.
 *
 * Reusable: cube shadow passes can use this with 6 different lightVP matrices.
 */
export const SHADOW_VERTEX_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>;

@vertex
fn main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return lightVP * object.model * vec4<f32>(position, 1.0);
}
`;
