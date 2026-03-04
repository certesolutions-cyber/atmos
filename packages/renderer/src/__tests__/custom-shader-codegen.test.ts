import { describe, it, expect } from 'vitest';
import { generateCustomVertexShader, generateCustomShadowVertexShader } from '../custom-shader-codegen.js';
import type { CustomShaderDescriptor } from '../custom-shader-parser.js';

function makeDescriptor(vertexSource: string): CustomShaderDescriptor {
  return {
    properties: [
      { name: 'amplitude', type: 'float', default: [1.0], byteOffset: 0, floatCount: 1 },
      { name: 'speed', type: 'float', default: [2.0], byteOffset: 16, floatCount: 1 },
    ],
    textures: [],
    uniformBufferSize: 32,
    fragmentSource: '@fragment fn main() -> @location(0) vec4<f32> { return vec4(1.0); }',
    vertexSource,
    opaque: false,
  };
}

const VERTEX_CODE = `fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    return position + normal * custom.amplitude;
}`;

describe('generateCustomVertexShader', () => {
  it('contains ObjectUniforms struct and bindings', () => {
    const code = generateCustomVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('struct ObjectUniforms');
    expect(code).toContain('@group(0) @binding(0)');
  });

  it('contains CustomUniforms with properties', () => {
    const code = generateCustomVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('struct CustomUniforms');
    expect(code).toContain('amplitude: f32');
    expect(code).toContain('speed: f32');
  });

  it('contains SceneUniforms struct', () => {
    const code = generateCustomVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('struct SceneUniforms');
  });

  it('includes user displaceVertex function', () => {
    const code = generateCustomVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('fn displaceVertex');
    expect(code).toContain('custom.amplitude');
  });

  it('generates main that calls displaceVertex', () => {
    const code = generateCustomVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('let displaced = displaceVertex(input.position, input.normal, input.uv)');
    expect(code).toContain('object.mvp * vec4<f32>(displaced, 1.0)');
    expect(code).toContain('object.model * vec4<f32>(displaced, 1.0)');
  });

  it('binds custom + scene uniforms to group 1', () => {
    const code = generateCustomVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('@group(1) @binding(0) var<uniform> custom: CustomUniforms');
    expect(code).toContain('@group(1) @binding(1) var<uniform> scene: SceneUniforms');
  });
});

describe('generateCustomShadowVertexShader', () => {
  it('uses lightVP on group 1', () => {
    const code = generateCustomShadowVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('@group(1) @binding(0) var<uniform> lightVP: mat4x4<f32>');
  });

  it('puts scene + custom on group 2', () => {
    const code = generateCustomShadowVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('@group(2) @binding(0) var<uniform> scene: SceneUniforms');
    expect(code).toContain('@group(2) @binding(1) var<uniform> custom: CustomUniforms');
  });

  it('calls displaceVertex in shadow main', () => {
    const code = generateCustomShadowVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('let displaced = displaceVertex(position, normal, uv)');
    expect(code).toContain('lightVP * object.model * vec4<f32>(displaced, 1.0)');
  });

  it('outputs only @builtin(position)', () => {
    const code = generateCustomShadowVertexShader(makeDescriptor(VERTEX_CODE));
    expect(code).toContain('-> @builtin(position) vec4<f32>');
  });
});
