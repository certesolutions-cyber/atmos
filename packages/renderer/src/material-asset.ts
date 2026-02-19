export type ShaderType = 'pbr' | 'unlit';

export interface MaterialAssetData {
  name: string;
  shader: ShaderType;
  albedo: [number, number, number, number];
  metallic: number;
  roughness: number;
  albedoTexture?: string; // relative path e.g. "textures/wood.png"
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
  };
}
