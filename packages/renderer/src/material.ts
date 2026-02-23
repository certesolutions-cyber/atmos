import type { GPUTextureHandle } from './texture.js';

export interface MaterialParams {
  albedo?: [number, number, number, number];
  metallic?: number;
  roughness?: number;
  albedoTexture?: GPUTextureHandle;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  normalTexture?: GPUTextureHandle;
  metallicRoughnessTexture?: GPUTextureHandle;
  splatSharpness?: number;
}

export interface Material {
  albedo: Float32Array; // vec4
  metallic: number;
  roughness: number;
  emissive: Float32Array; // vec3
  emissiveIntensity: number;
  /** Terrain splat sharpness exponent (1 = linear, higher = sharper). Default 1. */
  splatSharpness: number;
  dirty: boolean;
  uniformBuffer: GPUBuffer | null;
  bindGroup: GPUBindGroup | null;
  albedoTexture: GPUTextureHandle | null;
  normalTexture: GPUTextureHandle | null;
  metallicRoughnessTexture: GPUTextureHandle | null;
  textureVersion: number;
}

/**
 * Bytes: vec4 albedo(16) + f32 metallic(4) + f32 roughness(4) + 8B pad
 *      + vec4 emissive(16: rgb + intensity in w) = 48
 */
export const MATERIAL_UNIFORM_SIZE = 48;

export function createMaterial(params?: MaterialParams): Material {
  return {
    albedo: new Float32Array(params?.albedo ?? [1, 1, 1, 1]),
    metallic: params?.metallic ?? 0.0,
    roughness: params?.roughness ?? 0.5,
    emissive: new Float32Array(params?.emissive ?? [0, 0, 0]),
    emissiveIntensity: params?.emissiveIntensity ?? 0,
    splatSharpness: params?.splatSharpness ?? 1,
    dirty: true,
    uniformBuffer: null,
    bindGroup: null,
    albedoTexture: params?.albedoTexture ?? null,
    normalTexture: params?.normalTexture ?? null,
    metallicRoughnessTexture: params?.metallicRoughnessTexture ?? null,
    textureVersion: 0,
  };
}

/**
 * Write material uniforms into a Float32Array for GPU upload.
 * Layout: [albedo(4), metallic, roughness, pad, pad, emissive.rgb(3), emissiveIntensity]
 */
export function writeMaterialUniforms(out: Float32Array, mat: Material): void {
  out[0] = mat.albedo[0]!;
  out[1] = mat.albedo[1]!;
  out[2] = mat.albedo[2]!;
  out[3] = mat.albedo[3]!;
  out[4] = mat.metallic;
  out[5] = mat.roughness;
  out[6] = mat.splatSharpness ?? 1;
  out[7] = 0;
  out[8] = mat.emissive[0]!;
  out[9] = mat.emissive[1]!;
  out[10] = mat.emissive[2]!;
  out[11] = mat.emissiveIntensity;
}
