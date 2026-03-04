/**
 * Generates a complete WGSL fragment shader from a CustomShaderDescriptor.
 *
 * The generated code includes:
 * 1. Constants (PI, MAX_*_LIGHTS)
 * 2. CustomUniforms struct (from @property metadata, 16-byte aligned)
 * 3. Scene structs (DirLight, PointLight, SpotLight, SceneUniforms)
 * 4. Bind group 1 declarations (custom uniforms, scene uniforms, textures)
 * 5. Shadow code (group 2)
 * 6. PBR helper functions (available but not required)
 * 7. FragmentInput struct
 * 8. User's fragment code
 */

import type { CustomShaderDescriptor } from './custom-shader-parser.js';
import { SCENE_STRUCTS_WGSL, PBR_FUNCTIONS_WGSL, LIGHT_LOOP_WGSL, FOG_WGSL } from './pbr-wgsl.js';
import { SHADOW_FRAGMENT_WGSL } from './shadow-fragment-wgsl.js';

const WGSL_TYPE_MAP: Record<string, string> = {
  float: 'f32',
  vec2: 'vec2<f32>',
  vec3: 'vec3<f32>',
  vec4: 'vec4<f32>',
};

const PAD_SIZE: Record<string, number> = {
  float: 3, // 1 float + 3 pad
  vec2: 2,  // 2 floats + 2 pad
  vec3: 1,  // 3 floats + 1 pad
  vec4: 0,  // 4 floats, no pad
};

export function generateCustomFragmentShader(descriptor: CustomShaderDescriptor): string {
  const parts: string[] = [];

  // 1. Constants
  parts.push(`const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;
`);

  // 2. CustomUniforms struct
  parts.push(generateCustomUniformsStruct(descriptor));

  // 3. Scene structs
  parts.push(SCENE_STRUCTS_WGSL);

  // 4. Bind group 1 declarations
  parts.push(`@group(1) @binding(0) var<uniform> custom: CustomUniforms;`);
  parts.push(`@group(1) @binding(1) var<uniform> scene: SceneUniforms;`);

  for (const tex of descriptor.textures) {
    parts.push(`@group(1) @binding(${tex.bindingIndex}) var ${tex.name}: texture_2d<f32>;`);
    parts.push(`@group(1) @binding(${tex.samplerBindingIndex}) var ${tex.name}Sampler: sampler;`);
  }
  parts.push('');

  // 5. Shadow code (group 2)
  parts.push(SHADOW_FRAGMENT_WGSL);

  // 5b. Scene depth texture (group 3) for depth-based effects
  parts.push(`@group(3) @binding(0) var sceneDepth: texture_depth_2d;`);
  parts.push('');

  // 6. PBR helper functions (available for use, not required)
  parts.push(PBR_FUNCTIONS_WGSL);

  // 7. Light loop and fog helpers (available as functions)
  parts.push(`
fn computeLightLoop(
  N: vec3<f32>, V: vec3<f32>,
  albedo: vec3<f32>, metallic: f32, roughness: f32,
  F0: vec3<f32>, worldPosition: vec3<f32>,
) -> vec3<f32> {
  var Lo = vec3<f32>(0.0);
` + LIGHT_LOOP_WGSL + `
  return Lo;
}

fn applyFog(color: vec3<f32>, worldPosition: vec3<f32>) -> vec3<f32> {
  var c = color;
` + FOG_WGSL.replace(/\bcolor\b/g, 'c') + `
  return c;
}
`);

  // 8. FragmentInput struct
  parts.push(`struct FragmentInput {
  @builtin(position) fragCoord: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

// Linearize a [0..1] depth buffer value to view-space distance
fn linearizeDepth(d: f32, near: f32, far: f32) -> f32 {
  return near * far / (far - d * (far - near));
}

// Get the linear depth of the opaque scene behind this fragment.
// Returns the view-space distance, or a very large value if nothing is there.
fn getSceneDepth(fragCoord: vec4<f32>) -> f32 {
  let coord = vec2<i32>(fragCoord.xy);
  let rawDepth = textureLoad(sceneDepth, coord, 0);
  return linearizeDepth(rawDepth, scene.cameraNear, scene.cameraFar);
}

// Get linear depth of the current fragment (water surface).
fn getFragmentDepth(fragCoord: vec4<f32>) -> f32 {
  return linearizeDepth(fragCoord.z, scene.cameraNear, scene.cameraFar);
}
`);

  // 9. User's fragment code
  parts.push(descriptor.fragmentSource);

  return parts.join('\n');
}

/**
 * Generates a custom vertex shader with user's displaceVertex function.
 * Layout: group 0 = ObjectUniforms, group 1 binding 0 = CustomUniforms, group 1 binding 1 = SceneUniforms.
 */
export function generateCustomVertexShader(descriptor: CustomShaderDescriptor): string {
  const parts: string[] = [];

  parts.push(generateCustomUniformsStruct(descriptor));
  parts.push(SCENE_STRUCTS_WGSL);

  // Object uniforms (group 0)
  parts.push(`struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> object: ObjectUniforms;
`);

  // Group 1: custom + scene uniforms (VERTEX | FRAGMENT visible)
  parts.push(`@group(1) @binding(0) var<uniform> custom: CustomUniforms;`);
  parts.push(`@group(1) @binding(1) var<uniform> scene: SceneUniforms;`);
  parts.push('');

  // User's vertex code (contains displaceVertex function)
  parts.push(descriptor.vertexSource!);
  parts.push('');

  // Generated vertex main
  parts.push(`struct VertexInput {
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
  let displaced = displaceVertex(input.position, input.normal, input.uv);
  var output: VertexOutput;
  let worldPos = object.model * vec4<f32>(displaced, 1.0);
  output.clipPosition = object.mvp * vec4<f32>(displaced, 1.0);
  output.worldPosition = worldPos.xyz;
  output.worldNormal = (object.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz;
  output.uv = input.uv;
  return output;
}
`);

  return parts.join('\n');
}

/**
 * Generates a shadow vertex shader for custom vertex displacement.
 * Layout: group 0 = ObjectUniforms, group 1 = lightVP, group 2 = scene + custom uniforms.
 */
export function generateCustomShadowVertexShader(descriptor: CustomShaderDescriptor): string {
  const parts: string[] = [];

  parts.push(generateCustomUniformsStruct(descriptor));
  parts.push(SCENE_STRUCTS_WGSL);

  // Object uniforms (group 0)
  parts.push(`struct ObjectUniforms {
  mvp: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> object: ObjectUniforms;
`);

  // Group 1: lightVP (same layout as standard shadow passes)
  parts.push(`@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>;`);
  parts.push('');

  // Group 2: scene + custom uniforms
  parts.push(`@group(2) @binding(0) var<uniform> scene: SceneUniforms;`);
  parts.push(`@group(2) @binding(1) var<uniform> custom: CustomUniforms;`);
  parts.push('');

  // User's vertex code
  parts.push(descriptor.vertexSource!);
  parts.push('');

  // Generated shadow vertex main (needs pos+normal+uv for displaceVertex)
  parts.push(`@vertex
fn main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
) -> @builtin(position) vec4<f32> {
  let displaced = displaceVertex(position, normal, uv);
  return lightVP * object.model * vec4<f32>(displaced, 1.0);
}
`);

  return parts.join('\n');
}

function generateCustomUniformsStruct(descriptor: CustomShaderDescriptor): string {
  if (descriptor.properties.length === 0) {
    // Need at least a dummy field for the uniform buffer
    return `struct CustomUniforms {\n  _pad: vec4<f32>,\n};\n`;
  }

  const lines = ['struct CustomUniforms {'];
  let padIdx = 0;

  for (const prop of descriptor.properties) {
    const wgslType = WGSL_TYPE_MAP[prop.type]!;
    lines.push(`  ${prop.name}: ${wgslType},`);
    const padCount = PAD_SIZE[prop.type]!;
    // Use individual f32 padding fields to avoid WGSL alignment gaps
    // (vec2/vec3 have alignment > 4 which causes implicit padding)
    for (let p = 0; p < padCount; p++) {
      lines.push(`  _pad${padIdx}_${p}: f32,`);
    }
    if (padCount > 0) padIdx++;
  }

  lines.push('};');
  return lines.join('\n') + '\n';
}
