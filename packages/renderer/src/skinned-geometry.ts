/**
 * Skinned vertex format constants.
 * Layout: position(3) + normal(3) + uv(2) + joints_u8x4(1) + weights_f32x4(4) = 13 floats = 52 bytes
 *
 * Joints are packed as 4 × u8 into a single u32 (4 bytes at byte offset 32).
 * Weights are 4 × f32 (16 bytes at byte offset 36).
 */

/** Floats per skinned vertex: 3 + 3 + 2 + 1(u8x4 packed) + 4 = 13 */
export const SKINNED_VERTEX_STRIDE_FLOATS = 13;

/** Bytes per skinned vertex */
export const SKINNED_VERTEX_STRIDE_BYTES = 52;

/** GPU vertex buffer layout for skinned meshes. */
export const SKINNED_VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: SKINNED_VERTEX_STRIDE_BYTES,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },   // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' },   // normal
    { shaderLocation: 2, offset: 24, format: 'float32x2' },   // uv
    { shaderLocation: 3, offset: 32, format: 'uint8x4' },     // joint indices (u8x4)
    { shaderLocation: 4, offset: 36, format: 'float32x4' },   // joint weights
  ],
};
