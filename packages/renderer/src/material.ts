import type { GPUTextureHandle } from './texture.js';

export interface MaterialParams {
  albedo?: [number, number, number, number];
  metallic?: number;
  roughness?: number;
  albedoTexture?: GPUTextureHandle;
}

export interface Material {
  albedo: Float32Array; // vec4
  metallic: number;
  roughness: number;
  dirty: boolean;
  uniformBuffer: GPUBuffer | null;
  bindGroup: GPUBindGroup | null;
  albedoTexture: GPUTextureHandle | null;
  textureVersion: number;
}

/** Bytes: vec4 albedo(16) + f32 metallic(4) + f32 roughness(4) + 8B pad = 32 */
export const MATERIAL_UNIFORM_SIZE = 32;

export function createMaterial(params?: MaterialParams): Material {
  return {
    albedo: new Float32Array(params?.albedo ?? [1, 1, 1, 1]),
    metallic: params?.metallic ?? 0.0,
    roughness: params?.roughness ?? 0.5,
    dirty: true,
    uniformBuffer: null,
    bindGroup: null,
    albedoTexture: params?.albedoTexture ?? null,
    textureVersion: 0,
  };
}

/**
 * Write material uniforms into a Float32Array for GPU upload.
 * Layout: [albedo.r, albedo.g, albedo.b, albedo.a, metallic, roughness, pad, pad]
 */
export function writeMaterialUniforms(out: Float32Array, mat: Material): void {
  out[0] = mat.albedo[0]!;
  out[1] = mat.albedo[1]!;
  out[2] = mat.albedo[2]!;
  out[3] = mat.albedo[3]!;
  out[4] = mat.metallic;
  out[5] = mat.roughness;
  out[6] = 0;
  out[7] = 0;
}
