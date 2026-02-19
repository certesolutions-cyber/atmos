export const UNLIT_VERTEX_SHADER = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VIn {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
};

struct VOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex fn vs(input: VIn) -> VOut {
  var out: VOut;
  out.position = u.mvp * vec4<f32>(input.position, 1.0);
  out.color = input.color;
  return out;
}
`;

export const UNLIT_FRAGMENT_SHADER = /* wgsl */ `
struct FIn {
  @location(0) color: vec3<f32>,
};

@fragment fn fs(input: FIn) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;
