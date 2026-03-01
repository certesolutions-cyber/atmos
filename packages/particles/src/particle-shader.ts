/**
 * Particle billboard shader.
 *
 * Each particle is a camera-facing quad built from 4 vertices.
 * Instance data (position, color, size, rotation) comes from a storage buffer.
 * The vertex shader expands each particle into a billboard in view space.
 */

export const PARTICLE_VERTEX_SHADER = /* wgsl */ `
struct CameraUniforms {
  viewProjection: mat4x4<f32>,
  cameraRight: vec3<f32>,
  _pad0: f32,
  cameraUp: vec3<f32>,
  _pad1: f32,
};

struct Particle {
  position: vec3<f32>,
  size: f32,
  color: vec4<f32>,
  rotation: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

// Quad corners: 2 triangles from 6 vertices
const QUAD_POS = array<vec2<f32>, 6>(
  vec2<f32>(-0.5, -0.5),
  vec2<f32>( 0.5, -0.5),
  vec2<f32>( 0.5,  0.5),
  vec2<f32>(-0.5, -0.5),
  vec2<f32>( 0.5,  0.5),
  vec2<f32>(-0.5,  0.5),
);

const QUAD_UV = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 1.0),
  vec2<f32>(1.0, 0.0),
  vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 0.0),
  vec2<f32>(0.0, 0.0),
);

@vertex fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VOut {
  let p = particles[instanceIndex];
  let corner = QUAD_POS[vertexIndex % 6u];

  // Rotate corner
  let cosR = cos(p.rotation);
  let sinR = sin(p.rotation);
  let rotated = vec2<f32>(
    corner.x * cosR - corner.y * sinR,
    corner.x * sinR + corner.y * cosR,
  );

  // Billboard: expand in camera-space
  let worldPos = p.position
    + camera.cameraRight * rotated.x * p.size
    + camera.cameraUp * rotated.y * p.size;

  var out: VOut;
  out.position = camera.viewProjection * vec4<f32>(worldPos, 1.0);
  out.color = p.color;
  out.uv = QUAD_UV[vertexIndex % 6u];
  return out;
}
`;

export const PARTICLE_FRAGMENT_SHADER = /* wgsl */ `
struct FIn {
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

@fragment fn fs(input: FIn) -> @location(0) vec4<f32> {
  // Soft circle falloff
  let dist = length(input.uv - vec2<f32>(0.5, 0.5)) * 2.0;
  let alpha = saturate(1.0 - dist * dist) * input.color.a;
  return vec4<f32>(input.color.rgb * alpha, alpha);
}
`;

/** Size of the camera uniform buffer in bytes. */
export const PARTICLE_CAMERA_UNIFORM_SIZE = 48; // mat4(64) + right(12+pad4) + up(12+pad4) = 96
// Actual: viewProjection(64) + cameraRight(12) + pad(4) + cameraUp(12) + pad(4) = 96
export const PARTICLE_CAMERA_BUFFER_SIZE = 96;

/** Size of one particle in the storage buffer (must match Particle struct). */
export const PARTICLE_STRIDE_BYTES = 48; // position(12) + size(4) + color(16) + rotation(4) + pad(12) = 48
