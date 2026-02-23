/**
 * Skinned vertex format constants.
 * Layout: position(3) + normal(3) + uv(2) + joints_u16x4(2) + weights_f32x4(4) = 14 floats = 56 bytes
 *
 * Joints are packed as 4 × u16 (8 bytes at byte offset 32).
 * Weights are 4 × f32 (16 bytes at byte offset 40).
 */

/** Floats per skinned vertex: 3 + 3 + 2 + 2(u16x4 packed) + 4 = 14 */
export const SKINNED_VERTEX_STRIDE_FLOATS = 14;

/** Bytes per skinned vertex */
export const SKINNED_VERTEX_STRIDE_BYTES = 56;

/** GPU vertex buffer layout for skinned meshes. */
export const SKINNED_VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: SKINNED_VERTEX_STRIDE_BYTES,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },   // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' },   // normal
    { shaderLocation: 2, offset: 24, format: 'float32x2' },   // uv
    { shaderLocation: 3, offset: 32, format: 'uint16x4' },    // joint indices (u16x4)
    { shaderLocation: 4, offset: 40, format: 'float32x4' },   // joint weights
  ],
};
