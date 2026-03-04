import { describe, it, expect } from 'vitest';
import { parseCustomShader } from '../custom-shader-parser.js';

describe('parseCustomShader', () => {
  it('parses properties and fragment source without vertex section', () => {
    const source = `/// @property speed: float = 1.0

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4<f32>(1.0);
}`;
    const desc = parseCustomShader(source);
    expect(desc.properties).toHaveLength(1);
    expect(desc.properties[0]!.name).toBe('speed');
    expect(desc.vertexSource).toBeNull();
    expect(desc.fragmentSource).toContain('@fragment fn main');
  });

  it('extracts vertex source between /// @vertex and @fragment fn', () => {
    const source = `/// @property amplitude: float = 1.0

/// @vertex
fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    return position + normal * custom.amplitude;
}

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4<f32>(1.0);
}`;
    const desc = parseCustomShader(source);
    expect(desc.vertexSource).not.toBeNull();
    expect(desc.vertexSource).toContain('displaceVertex');
    expect(desc.vertexSource).not.toContain('@fragment');
    expect(desc.vertexSource).not.toContain('/// @vertex');
    expect(desc.fragmentSource).toContain('@fragment fn main');
    expect(desc.fragmentSource).not.toContain('displaceVertex');
  });

  it('handles vertex section with multiple functions', () => {
    const source = `/// @property speed: float = 2.0

/// @vertex
fn helper(x: f32) -> f32 { return sin(x); }

fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    return position + normal * helper(custom.speed);
}

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4<f32>(1.0);
}`;
    const desc = parseCustomShader(source);
    expect(desc.vertexSource).toContain('helper');
    expect(desc.vertexSource).toContain('displaceVertex');
  });

  it('handles properties before vertex marker', () => {
    const source = `/// @property amplitude: float = 1.0
/// @property speed: float = 2.0
/// @texture heightMap

/// @vertex
fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    return position;
}

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4<f32>(1.0);
}`;
    const desc = parseCustomShader(source);
    expect(desc.properties).toHaveLength(2);
    expect(desc.textures).toHaveLength(1);
    expect(desc.vertexSource).not.toBeNull();
  });

  it('captures everything between @vertex and @fragment fn as vertex code', () => {
    const source = `/// @property amp: float = 1.0

/// @vertex
fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    return position;
}

fn vertexHelper() -> f32 { return 1.0; }

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4<f32>(1.0);
}`;
    const desc = parseCustomShader(source);
    expect(desc.vertexSource).toContain('displaceVertex');
    expect(desc.vertexSource).toContain('vertexHelper');
    expect(desc.fragmentSource).toContain('@fragment fn main');
    expect(desc.fragmentSource).not.toContain('displaceVertex');
  });

  it('defaults opaque to false', () => {
    const source = `/// @property speed: float = 1.0
@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> { return vec4(1.0); }`;
    const desc = parseCustomShader(source);
    expect(desc.opaque).toBe(false);
  });

  it('detects /// @opaque marker', () => {
    const source = `/// @opaque
/// @property speed: float = 1.0
@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> { return vec4(1.0); }`;
    const desc = parseCustomShader(source);
    expect(desc.opaque).toBe(true);
  });
});
