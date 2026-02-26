import type { Material } from '@certe/atmos-renderer';
import { createMaterial, decodeImageToRGBA, createTextureFromRGBA } from '@certe/atmos-renderer';
import type { MaterialAssetData, ShaderType } from '@certe/atmos-renderer';
import type { GPUTextureHandle } from '@certe/atmos-renderer';
import { deserializeMaterialAsset, serializeMaterialAsset, createDefaultMaterialAsset } from '@certe/atmos-renderer';
import type { ProjectFileSystem } from './project-fs.js';

interface CacheEntry {
  data: MaterialAssetData;
  material: Material;
}

export class MaterialManager {
  private _cache = new Map<string, CacheEntry>();
  private _textureCache = new Map<string, GPUTextureHandle>();

  constructor(
    private _projectFs: ProjectFileSystem,
    private _device: GPUDevice,
  ) {}

  async getMaterial(path: string): Promise<Material> {
    const cached = this._cache.get(path);
    if (cached) return cached.material;

    const json = await this._projectFs.readTextFile(path);
    const data = deserializeMaterialAsset(json);
    const material = await this._createGPUMaterial(data);
    this._cache.set(path, { data, material });
    return material;
  }

  getAssetData(path: string): MaterialAssetData | undefined {
    return this._cache.get(path)?.data;
  }

  getCachedMaterial(path: string): Material | undefined {
    return this._cache.get(path)?.material;
  }

  async createMaterial(name: string, shader: ShaderType = 'pbr'): Promise<string> {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const path = `materials/${safeName}.mat.json`;
    const data = createDefaultMaterialAsset(name);
    data.shader = shader;
    const json = serializeMaterialAsset(data);
    await this._projectFs.writeFile(path, json);
    const material = await this._createGPUMaterial(data);
    this._cache.set(path, { data, material });
    return path;
  }

  async updateMaterial(path: string, changes: Partial<MaterialAssetData>): Promise<void> {
    const entry = this._cache.get(path);
    if (!entry) return;

    const albedoChanged = 'albedoTexture' in changes
      && changes.albedoTexture !== entry.data.albedoTexture;
    const normalChanged = 'normalTexture' in changes
      && changes.normalTexture !== entry.data.normalTexture;
    const mrChanged = 'metallicRoughnessTexture' in changes
      && changes.metallicRoughnessTexture !== entry.data.metallicRoughnessTexture;

    // Merge changes into cached data
    Object.assign(entry.data, changes);

    // Sync GPU material from updated data
    this._syncGPUMaterial(entry.material, entry.data);

    // Load/clear textures if changed
    if (albedoChanged) await this._syncTexture(entry.material, 'albedoTexture', entry.data.albedoTexture);
    if (normalChanged) await this._syncTexture(entry.material, 'normalTexture', entry.data.normalTexture);
    if (mrChanged) await this._syncTexture(entry.material, 'metallicRoughnessTexture', entry.data.metallicRoughnessTexture);

    // Write to disk
    const json = serializeMaterialAsset(entry.data);
    await this._projectFs.writeFile(path, json);
  }

  async listMaterials(): Promise<string[]> {
    try {
      const files = await this._projectFs.listFiles('materials');
      return files.filter((f) => f.endsWith('.mat.json'));
    } catch {
      return [];
    }
  }

  async listTextures(): Promise<string[]> {
    try {
      const files = await this._projectFs.listFiles('textures');
      return files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
    } catch {
      return [];
    }
  }

  invalidate(path: string): void {
    this._cache.delete(path);
  }

  private async _createGPUMaterial(data: MaterialAssetData): Promise<Material> {
    const material = createMaterial({
      albedo: [data.albedo[0], data.albedo[1], data.albedo[2], data.albedo[3]],
      metallic: data.metallic,
      roughness: data.roughness,
      emissive: data.emissive ? [data.emissive[0], data.emissive[1], data.emissive[2]] : undefined,
      emissiveIntensity: data.emissiveIntensity,
      texTilingX: data.texTilingX,
      texTilingY: data.texTilingY,
    });

    if (data.albedoTexture) {
      await this._syncTexture(material, 'albedoTexture', data.albedoTexture);
    }
    if (data.normalTexture) {
      await this._syncTexture(material, 'normalTexture', data.normalTexture);
    }
    if (data.metallicRoughnessTexture) {
      await this._syncTexture(material, 'metallicRoughnessTexture', data.metallicRoughnessTexture);
    }

    return material;
  }

  private async _syncTexture(
    mat: Material, prop: 'albedoTexture' | 'normalTexture' | 'metallicRoughnessTexture',
    texturePath: string | undefined,
  ): Promise<void> {
    if (!texturePath) {
      mat[prop] = null;
      mat.textureVersion++;
      return;
    }

    const cached = this._textureCache.get(texturePath);
    if (cached) {
      mat[prop] = cached;
      mat.textureVersion++;
      return;
    }

    try {
      const buffer = await this._projectFs.readFile(texturePath);
      const ext = texturePath.split('.').pop()?.toLowerCase() ?? 'png';
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
      const blob = new Blob([buffer], { type: mimeMap[ext] ?? 'image/png' });
      const decoded = await decodeImageToRGBA(blob);
      const handle = createTextureFromRGBA(this._device, decoded.data, decoded.width, decoded.height);
      this._textureCache.set(texturePath, handle);
      mat[prop] = handle;
      mat.textureVersion++;
    } catch (err) {
      console.warn(`[MaterialManager] Failed to load texture: ${texturePath}`, err);
      mat[prop] = null;
      mat.textureVersion++;
    }
  }

  private _syncGPUMaterial(mat: Material, data: MaterialAssetData): void {
    mat.albedo[0] = data.albedo[0];
    mat.albedo[1] = data.albedo[1];
    mat.albedo[2] = data.albedo[2];
    mat.albedo[3] = data.albedo[3];
    mat.metallic = data.metallic;
    mat.roughness = data.roughness;
    if (data.emissive) {
      mat.emissive[0] = data.emissive[0];
      mat.emissive[1] = data.emissive[1];
      mat.emissive[2] = data.emissive[2];
    }
    if (data.emissiveIntensity !== undefined) mat.emissiveIntensity = data.emissiveIntensity;
    if (data.texTilingX !== undefined) mat.texTilingX = data.texTilingX;
    if (data.texTilingY !== undefined) mat.texTilingY = data.texTilingY;
    mat.dirty = true;
  }
}
