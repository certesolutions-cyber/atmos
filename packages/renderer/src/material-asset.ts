export type ShaderType = 'pbr' | 'unlit' | 'custom';

export interface MaterialAssetData {
  name: string;
  shader: ShaderType;
  albedo: [number, number, number, number];
  metallic: number;
  roughness: number;
  albedoTexture?: string; // relative path e.g. "textures/wood.png"
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  normalTexture?: string;
  metallicRoughnessTexture?: string;
  texTilingX?: number;
  texTilingY?: number;
  /** Path to custom .wgsl fragment shader (e.g. "shaders/my_shader.wgsl") */
  customShaderPath?: string;
  /** Override values for custom shader @property declarations */
  customUniforms?: Record<string, number | number[]>;
  /** Texture assignments for custom shader @texture declarations */
  customTextures?: Record<string, string>;
}

export function createDefaultMaterialAsset(name: string): MaterialAssetData {
  return {
    name,
    shader: 'pbr',
    albedo: [0.7, 0.7, 0.7, 1],
    metallic: 0,
    roughness: 0.5,
  };
}

export function serializeMaterialAsset(data: MaterialAssetData): string {
  return JSON.stringify(data, null, 2);
}

export function deserializeMaterialAsset(json: string): MaterialAssetData {
  const raw = JSON.parse(json) as Record<string, unknown>;
  return {
    name: (raw['name'] as string) ?? 'Unnamed',
    shader: (raw['shader'] as ShaderType) ?? 'pbr',
    albedo: (raw['albedo'] as [number, number, number, number]) ?? [1, 1, 1, 1],
    metallic: (raw['metallic'] as number) ?? 0,
    roughness: (raw['roughness'] as number) ?? 0.5,
    albedoTexture: (raw['albedoTexture'] as string) ?? undefined,
    emissive: (raw['emissive'] as [number, number, number]) ?? undefined,
    emissiveIntensity: (raw['emissiveIntensity'] as number) ?? undefined,
    normalTexture: (raw['normalTexture'] as string) ?? undefined,
    metallicRoughnessTexture: (raw['metallicRoughnessTexture'] as string) ?? undefined,
    texTilingX: (raw['texTilingX'] as number) ?? undefined,
    texTilingY: (raw['texTilingY'] as number) ?? undefined,
    customShaderPath: (raw['customShaderPath'] as string) ?? undefined,
    customUniforms: (raw['customUniforms'] as Record<string, number | number[]>) ?? undefined,
    customTextures: (raw['customTextures'] as Record<string, string>) ?? undefined,
  };
}
