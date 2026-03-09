/**
 * Procedural sky shader — fullscreen triangle with atmospheric gradient + sun disc.
 * Writes z = 1.0 (far plane) so all geometry draws on top.
 */

export const SKY_SHADER = /* wgsl */`
struct SkyUniforms {
  invVP: mat4x4<f32>,
  sunDir: vec4<f32>,
  zenithColor: vec4<f32>,
  horizonColor: vec4<f32>,
  groundColor: vec4<f32>,
  params: vec4<f32>,  // x = sunIntensity, y = groundFalloff
};

@group(0) @binding(0) var<uniform> sky: SkyUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};

var<private> pos: array<vec2<f32>, 3> = array(
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0),
);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
  var out: VertexOutput;
  let p = pos[i];
  out.position = vec4(p, 1.0, 1.0);  // z = 1.0 → far plane
  out.ndc = p;
  return out;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4<f32> {
  // Reconstruct world-space ray direction from NDC
  let clipNear = vec4(input.ndc, 0.0, 1.0);
  let clipFar  = vec4(input.ndc, 1.0, 1.0);
  let worldNear = sky.invVP * clipNear;
  let worldFar  = sky.invVP * clipFar;
  let near3 = worldNear.xyz / worldNear.w;
  let far3  = worldFar.xyz / worldFar.w;
  let dir = normalize(far3 - near3);

  // Atmospheric gradient: blend zenith → horizon based on elevation
  let up = vec3(0.0, 1.0, 0.0);
  let elevation = dot(dir, up);
  let t = clamp(elevation, 0.0, 1.0);
  let gradient = mix(sky.horizonColor.rgb, sky.zenithColor.rgb, sqrt(t));

  // Below horizon: fade quickly to ground color
  let falloff = sky.params.y;
  let belowT = clamp(-elevation * falloff, 0.0, 1.0);
  let skyColor = mix(gradient, sky.groundColor.rgb, belowT * belowT);

  // Sun disc + glow
  let sunDir = normalize(sky.sunDir.xyz);
  let cosAngle = dot(dir, sunDir);
  let sunIntensity = sky.params.x;

  // Sharp sun disc (angular radius ~0.5 degrees = cos(0.00873) ≈ 0.99996)
  let discMask = smoothstep(0.9997, 0.9999, cosAngle);
  let sunDisc = discMask * sunIntensity * 20.0;

  // Soft glow around sun
  let glow = pow(max(cosAngle, 0.0), 256.0) * sunIntensity * 4.0;
  let outerGlow = pow(max(cosAngle, 0.0), 32.0) * sunIntensity * 0.3;

  let sunColor = vec3(1.0, 0.95, 0.85);
  let finalColor = skyColor + sunColor * (sunDisc + glow + outerGlow);

  return vec4(finalColor, 1.0);
}
`;

/** Size of the SkyUniforms buffer in bytes (mat4 + 5×vec4 = 16+4+4+4+4+4 = 36 floats = 144). */
export const SKY_UNIFORM_SIZE = 144;
