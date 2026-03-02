import type { Material } from '@certe/atmos-renderer';
import { createMaterial, decodeImageToRGBA, createTextureFromRGBA } from '@certe/atmos-renderer';
import type { MaterialAssetData, ShaderType } from '@certe/atmos-renderer';
import type { GPUTextureHandle } from '@certe/atmos-renderer';
import type { CustomShaderDescriptor } from '@certe/atmos-renderer';
import { deserializeMaterialAsset, serializeMaterialAsset, createDefaultMaterialAsset, parseCustomShader } from '@certe/atmos-renderer';
import type { ProjectFileSystem } from './project-fs.js';

interface CacheEntry {
  data: MaterialAssetData;
  material: Material;
}

export class MaterialManager {
  private _cache = new Map<string, CacheEntry>();
  private _textureCache = new Map<string, GPUTextureHandle>();
  private _shaderSourceCache = new Map<string, string>();
  private _shaderDescriptorCache = new Map<string, CustomShaderDescriptor>();

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
    const customShaderChanged = 'customShaderPath' in changes
      && changes.customShaderPath !== entry.data.customShaderPath;
    const customUniformsChanged = 'customUniforms' in changes;
    const customTexturesChanged = 'customTextures' in changes;

    // Merge changes into cached data
    Object.assign(entry.data, changes);

    // Sync GPU material from updated data
    this._syncGPUMaterial(entry.material, entry.data);

    // Load/clear textures if changed
    if (albedoChanged) await this._syncTexture(entry.material, 'albedoTexture', entry.data.albedoTexture);
    if (normalChanged) await this._syncTexture(entry.material, 'normalTexture', entry.data.normalTexture);
    if (mrChanged) await this._syncTexture(entry.material, 'metallicRoughnessTexture', entry.data.metallicRoughnessTexture);

    // Handle custom shader changes
    if (customShaderChanged) {
      await this._setupCustomShader(entry.material, entry.data);
    }
    if (customUniformsChanged || customShaderChanged) {
      await this._syncCustomUniforms(entry.material, entry.data);
    }
    if (customTexturesChanged || customShaderChanged) {
      await this._syncCustomTextures(entry.material, entry.data);
    }

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

  /** List .wgsl shader files in the shaders/ directory. */
  async listShaders(): Promise<string[]> {
    try {
      const files = await this._projectFs.listFiles('shaders');
      return files.filter((f) => f.endsWith('.wgsl'));
    } catch {
      return [];
    }
  }

  /** Load and cache shader source text. */
  async loadShaderSource(path: string): Promise<string> {
    const cached = this._shaderSourceCache.get(path);
    if (cached) return cached;
    const source = await this._projectFs.readTextFile(path);
    this._shaderSourceCache.set(path, source);
    return source;
  }

  /** Parse and cache a custom shader descriptor. */
  async parseShader(path: string): Promise<CustomShaderDescriptor> {
    const cached = this._shaderDescriptorCache.get(path);
    if (cached) return cached;
    const source = await this.loadShaderSource(path);
    const descriptor = parseCustomShader(source);
    this._shaderDescriptorCache.set(path, descriptor);
    return descriptor;
  }

  /** Invalidate shader caches (on hot reload). */
  invalidateShader(path: string): void {
    this._shaderSourceCache.delete(path);
    this._shaderDescriptorCache.delete(path);
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

    // Set up custom shader if applicable
    if (data.shader === 'custom') {
      material.shaderType = 'custom';
      await this._setupCustomShader(material, data);
      await this._syncCustomUniforms(material, data);
      await this._syncCustomTextures(material, data);
    }

    return material;
  }

  /** Configure material for a custom shader. */
  private async _setupCustomShader(mat: Material, data: MaterialAssetData): Promise<void> {
    mat.shaderType = data.shader;
    mat.customShaderPath = data.customShaderPath ?? null;
    // Reset custom bind group state when shader changes
    mat.customUniformBuffer = null;
    mat.customUniformData = null;
    mat.customTextures.clear();
    mat.textureVersion++;
  }

  /** Sync custom uniform data from asset data defaults + overrides. */
  private async _syncCustomUniforms(mat: Material, data: MaterialAssetData): Promise<void> {
    if (!data.customShaderPath) return;

    try {
      const descriptor = await this.parseShader(data.customShaderPath);
      const floatCount = descriptor.uniformBufferSize / 4;
      const uniformData = new Float32Array(floatCount);

      // Write default values from shader descriptor
      for (const prop of descriptor.properties) {
        const offset = prop.byteOffset / 4;
        for (let i = 0; i < prop.floatCount; i++) {
          uniformData[offset + i] = prop.default[i] ?? 0;
        }
      }

      // Apply overrides from material asset
      if (data.customUniforms) {
        for (const prop of descriptor.properties) {
          const override = data.customUniforms[prop.name];
          if (override !== undefined) {
            const offset = prop.byteOffset / 4;
            if (typeof override === 'number') {
              uniformData[offset] = override;
            } else if (Array.isArray(override)) {
              for (let i = 0; i < Math.min(override.length, prop.floatCount); i++) {
                uniformData[offset + i] = override[i]!;
              }
            }
          }
        }
      }

      mat.customUniformData = uniformData;
      mat.customDirty = true;
    } catch (err) {
      console.warn('[MaterialManager] Failed to sync custom uniforms:', err);
    }
  }

  /** Sync custom texture handles from asset data. */
  private async _syncCustomTextures(mat: Material, data: MaterialAssetData): Promise<void> {
    mat.customTextures.clear();
    if (!data.customTextures || !data.customShaderPath) return;

    for (const [name, texPath] of Object.entries(data.customTextures)) {
      if (!texPath) continue;
      try {
        const handle = await this._loadTexture(texPath);
        if (handle) mat.customTextures.set(name, handle);
      } catch (err) {
        console.warn(`[MaterialManager] Failed to load custom texture "${name}": ${texPath}`, err);
      }
    }
    mat.textureVersion++;
  }

  /** Load a texture handle (with caching). */
  private async _loadTexture(texturePath: string, srgb = true): Promise<GPUTextureHandle | null> {
    const cacheKey = srgb ? texturePath : `${texturePath}:linear`;
    const cached = this._textureCache.get(cacheKey);
    if (cached) return cached;

    try {
      const buffer = await this._projectFs.readFile(texturePath);
      const ext = texturePath.split('.').pop()?.toLowerCase() ?? 'png';
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
      const blob = new Blob([buffer], { type: mimeMap[ext] ?? 'image/png' });
      const decoded = await decodeImageToRGBA(blob);
      const handle = createTextureFromRGBA(this._device, decoded.data, decoded.width, decoded.height, srgb);
      this._textureCache.set(cacheKey, handle);
      return handle;
    } catch (err) {
      console.warn(`[MaterialManager] Failed to load texture: ${texturePath}`, err);
      return null;
    }
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

    const srgb = prop === 'albedoTexture';
    const handle = await this._loadTexture(texturePath, srgb);
    mat[prop] = handle;
    mat.textureVersion++;
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
    mat.shaderType = data.shader;
    mat.customShaderPath = data.customShaderPath ?? null;
    mat.dirty = true;
  }
}
