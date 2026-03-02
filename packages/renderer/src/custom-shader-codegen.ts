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
