import type { ModelAsset } from '@certe/atmos-assets';
import { serializeMaterialAsset } from '@certe/atmos-renderer';
import type { MaterialAssetData } from '@certe/atmos-renderer';
import type { ProjectFileSystem } from '../project-fs.js';
import type { MaterialManager } from '../material-manager.js';

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/**
 * Save embedded textures and create .mat.json files for a model's materials.
 * Returns a map of material index → .mat.json path.
 */
export async function importModelAssets(
  asset: ModelAsset,
  modelName: string,
  projectFs: ProjectFileSystem,
  materialManager: MaterialManager,
): Promise<Map<number, string>> {
  const safeName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

  // 1. Save embedded textures
  const texturePaths: string[] = [];
  for (const tex of asset.textures) {
    const ext = MIME_EXT[tex.mimeType] ?? '.png';
    const texName = tex.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `textures/${safeName}_${texName}${ext}`;
    texturePaths.push(path);

    const exists = await projectFs.exists(path);
    if (!exists) {
      // tex.data may be a view into the larger GLB buffer — copy just the slice
      const bytes = tex.data.slice();
      await projectFs.writeFile(path, bytes.buffer as ArrayBuffer);
    }
  }

  // 2. Create .mat.json files for each material
  const materialMap = new Map<number, string>();
  for (let i = 0; i < asset.materials.length; i++) {
    const mat = asset.materials[i]!;
    const matName = mat.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const path = `materials/${safeName}_${matName}.mat.json`;

    const exists = await projectFs.exists(path);
    if (!exists) {
      const albedo = mat.params.albedo ?? [1, 1, 1, 1];
      const data: MaterialAssetData = {
        name: mat.name || `${modelName} Material ${i}`,
        shader: 'pbr',
        albedo: [albedo[0], albedo[1], albedo[2], albedo[3]],
        metallic: mat.params.metallic ?? 0,
        roughness: mat.params.roughness ?? 0.5,
      };

      if (mat.albedoTextureIndex !== null && texturePaths[mat.albedoTextureIndex]) {
        data.albedoTexture = texturePaths[mat.albedoTextureIndex];
      }

      const json = serializeMaterialAsset(data);
      await projectFs.writeFile(path, json);
    }

    // Pre-load into MaterialManager cache
    await materialManager.getMaterial(path);
    materialMap.set(i, path);
  }

  return materialMap;
}
