export const GRID_VERTEX_SHADER = /* wgsl */ `
struct Uniforms {
  viewProjection: mat4x4<f32>,
  cameraPos: vec3<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VOut {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
};

// Full-screen XZ quad, large enough for visible grid
const EXTENT = 500.0;
const positions = array<vec2<f32>, 6>(
  vec2<f32>(-1, -1), vec2<f32>(1, -1), vec2<f32>(1, 1),
  vec2<f32>(-1, -1), vec2<f32>(1, 1), vec2<f32>(-1, 1),
);

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  let p = positions[vi];
  let worldPos = vec3<f32>(u.cameraPos.x + p.x * EXTENT, 0.0, u.cameraPos.z + p.y * EXTENT);
  var out: VOut;
  out.position = u.viewProjection * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  return out;
}
`;

export const GRID_FRAGMENT_SHADER = /* wgsl */ `
struct Uniforms {
  viewProjection: mat4x4<f32>,
  cameraPos: vec3<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct FIn {
  @location(0) worldPos: vec3<f32>,
};

fn gridLine(coord: f32, scale: f32) -> f32 {
  let d = fract(coord / scale + 0.5) - 0.5;
  let deriv = fwidth(coord / scale);
  return 1.0 - smoothstep(-deriv, deriv, abs(d) - deriv);
}

@fragment fn fs(input: FIn) -> @location(0) vec4<f32> {
  let dist = length(input.worldPos.xz - u.cameraPos.xz);

  // Minor grid (1m)
  let minorX = gridLine(input.worldPos.x, 1.0);
  let minorZ = gridLine(input.worldPos.z, 1.0);
  let minor = max(minorX, minorZ);

  // Major grid (10m)
  let majorX = gridLine(input.worldPos.x, 10.0);
  let majorZ = gridLine(input.worldPos.z, 10.0);
  let major = max(majorX, majorZ);

  // Axis lines (each uses its own fwidth for correct perspective scaling)
  let xAxisWidth = fwidth(input.worldPos.z) * 1.5;
  let xAxis = 1.0 - smoothstep(0.0, xAxisWidth, abs(input.worldPos.z));
  let zAxisWidth = fwidth(input.worldPos.x) * 1.5;
  let zAxis = 1.0 - smoothstep(0.0, zAxisWidth, abs(input.worldPos.x));

  // Base grid color
  var color = vec3<f32>(0.3, 0.3, 0.3);
  var alpha = minor * 0.15 + major * 0.25;

  // X-axis = red, Z-axis = blue
  if (xAxis > 0.01) {
    color = mix(color, vec3<f32>(0.8, 0.2, 0.2), xAxis);
    alpha = max(alpha, xAxis * 0.8);
  }
  if (zAxis > 0.01) {
    color = mix(color, vec3<f32>(0.2, 0.2, 0.8), zAxis);
    alpha = max(alpha, zAxis * 0.8);
  }

  // Fade with distance
  let fadeStart = 50.0;
  let fadeEnd = 200.0;
  let fade = 1.0 - smoothstep(fadeStart, fadeEnd, dist);
  alpha *= fade;

  if (alpha < 0.001) { discard; }
  return vec4<f32>(color, alpha);
}
`;
