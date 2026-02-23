/**
 * Point light shadow shader – renders linear depth into cube map faces.
 *
 * Unlike directional shadows (depth-only), point shadows need a fragment shader
 * to write linear depth (distance / far) via @builtin(frag_depth) for consistent
 * precision across all 6 cube faces.
 *
 * Group 0: object uniforms (reuses existing objectBGL)
 * Group 1: PointLightShadow { lightVP, lightPosAndFar }
 */
export const POINT_SHADOW_SHADER = /* wgsl */`
struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};

struct PointLightShadow {
  lightVP: mat4x4<f32>,
  lightPosAndFar: vec4<f32>,
};

@group(0) @binding(0) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var<uniform> shadow: PointLightShadow;

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
};

@vertex
fn vs(@location(0) position: vec3<f32>) -> VsOut {
  let worldPos = (object.model * vec4<f32>(position, 1.0)).xyz;
  var out: VsOut;
  out.clipPos = shadow.lightVP * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  return out;
}

struct FsOut {
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs(@location(0) worldPos: vec3<f32>) -> FsOut {
  let dist = length(worldPos - shadow.lightPosAndFar.xyz);
  var out: FsOut;
  out.depth = dist / shadow.lightPosAndFar.w;
  return out;
}
`;
