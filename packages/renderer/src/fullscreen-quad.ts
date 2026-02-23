/**
 * Fullscreen triangle utilities for post-processing passes.
 * Uses a single oversized triangle (3 verts, no vertex buffer) to cover the screen.
 */

export const FULLSCREEN_VERTEX_SHADER = /* wgsl */`
var<private> pos: array<vec2<f32>, 3> = array(
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0),
);

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
  var out: VertexOutput;
  let p = pos[i];
  out.position = vec4(p, 0.0, 1.0);
  out.uv = p * vec2(0.5, -0.5) + vec2(0.5);
  return out;
}
`;

/** Draw a fullscreen triangle (3 vertices, no vertex buffer). */
export function drawFullscreenTriangle(pass: GPURenderPassEncoder): void {
  pass.draw(3);
}
