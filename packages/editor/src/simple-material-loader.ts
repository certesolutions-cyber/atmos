import type { Material } from '@atmos/renderer';
import { createMaterial, decodeImageToRGBA, createTextureFromRGBA } from '@atmos/renderer';
import type { GPUTextureHandle } from '@atmos/renderer';
import { deserializeMaterialAsset } from '@atmos/renderer';

/**
 * Lightweight material loader for the standalone player runtime.
 * Fetches .mat.json files via HTTP and creates GPU materials.
 */
export class SimpleMaterialLoader {
  private _cache = new Map<string, Material>();
  private _textureCache = new Map<string, GPUTextureHandle>();
  private _pending = new Map<string, Promise<Material>>();

  constructor(
    private _device: GPUDevice,
    private _assetBase: string,
  ) {}

  async getMaterial(path: string): Promise<Material> {
    const cached = this._cache.get(path);
    if (cached) return cached;

    // Deduplicate concurrent loads for the same path
    const pending = this._pending.get(path);
    if (pending) return pending;

    const promise = this._load(path);
    this._pending.set(path, promise);
    try {
      const mat = await promise;
      return mat;
    } finally {
      this._pending.delete(path);
    }
  }

  private async _load(path: string): Promise<Material> {
    const url = this._assetBase + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch material: ${url}`);
    const json = await res.text();
    const data = deserializeMaterialAsset(json);

    const material = createMaterial({
      albedo: [data.albedo[0], data.albedo[1], data.albedo[2], data.albedo[3]],
      metallic: data.metallic,
      roughness: data.roughness,
      emissive: data.emissive ? [data.emissive[0], data.emissive[1], data.emissive[2]] : undefined,
      emissiveIntensity: data.emissiveIntensity,
      texTilingX: data.texTilingX,
      texTilingY: data.texTilingY,
    });

    if (data.albedoTexture) await this._loadTexture(material, 'albedoTexture', data.albedoTexture);
    if (data.normalTexture) await this._loadTexture(material, 'normalTexture', data.normalTexture);
    if (data.metallicRoughnessTexture) {
      await this._loadTexture(material, 'metallicRoughnessTexture', data.metallicRoughnessTexture);
    }

    this._cache.set(path, material);
    return material;
  }

  private async _loadTexture(
    mat: Material,
    prop: 'albedoTexture' | 'normalTexture' | 'metallicRoughnessTexture',
    texturePath: string,
  ): Promise<void> {
    const cached = this._textureCache.get(texturePath);
    if (cached) {
      mat[prop] = cached;
      mat.textureVersion++;
      return;
    }

    try {
      const url = this._assetBase + texturePath;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const decoded = await decodeImageToRGBA(blob);
      const handle = createTextureFromRGBA(this._device, decoded.data, decoded.width, decoded.height);
      this._textureCache.set(texturePath, handle);
      mat[prop] = handle;
      mat.textureVersion++;
    } catch (err) {
      console.warn(`[Player] Failed to load texture: ${texturePath}`, err);
    }
  }
}
