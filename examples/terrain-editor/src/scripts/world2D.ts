import { Scene } from "@certe/atmos-core";
import type { PropertyDef } from "@certe/atmos-core";
import {
  createMaterial,
  createTerrainPipeline,
  createTextureFromRGBA,
  decodeImageToRGBA,
  RenderSystem,
} from "@certe/atmos-renderer";
import type { SplatWeightFn, SplatTextures } from "@certe/atmos-terrain";
import {
  TerrainWorld,
  heightmapTerrain,
  imageToHeightmap,
} from "@certe/atmos-terrain";
import { TerrainDensityProvider } from "./terrainDensityProvider";

// --- Procedural splat textures ---
function generateSolidTexture(
  r: number,
  g: number,
  b: number,
  variation = 0.05,
  size = 64,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = 1 + (Math.random() - 0.5) * variation * 2;
    data[i * 4] = Math.min(255, Math.max(0, (r * v) | 0));
    data[i * 4 + 1] = Math.min(255, Math.max(0, (g * v) | 0));
    data[i * 4 + 2] = Math.min(255, Math.max(0, (b * v) | 0));
    data[i * 4 + 3] = 255;
  }
  return data;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const weightFn: SplatWeightFn = (_nx, ny, _nz, y) => {
  const slope = Math.max(0, ny);
  const grass = smoothstep(0.55, 0.85, slope);
  const snow = y > 10 ? smoothstep(10, 18, y) * slope : 0;
  const rock = Math.max(0, 1 - grass - snow);
  return [grass, rock];
};

/**
 * Heightmap-based terrain. Loads a grayscale image and converts it to terrain
 * via heightmapTerrain(). Attach to a GameObject with TerrainWorld.
 */
export class World2D extends TerrainDensityProvider {
  heightmapUrl = "";
  scaleX = 1;
  scaleZ = 1;
  scaleY = 30;
  loadRadius = 12;
  unloadRadius = 14;
  maxBuildsPerFrame = 10;

  static editorProperties: PropertyDef[] = [
    { key: "heightmapUrl", type: "texture" },
    { key: "scaleX", type: "number", min: 0.1, max: 10, step: 0.1 },
    { key: "scaleZ", type: "number", min: 0.1, max: 10, step: 0.1 },
    { key: "scaleY", type: "number", min: 1, max: 200, step: 1 },
    { key: "loadRadius", type: "number", min: 1, max: 32, step: 1 },
    { key: "unloadRadius", type: "number", min: 2, max: 40, step: 1 },
    { key: "maxBuildsPerFrame", type: "number", min: 1, max: 30, step: 1 },
  ];

  private _initialized = false;
  private _loading = false;

  get ready(): boolean { return this._initialized; }
  // Snapshot of values used in last init — detect changes
  private _appliedUrl = "";
  private _appliedScaleX = 0;
  private _appliedScaleZ = 0;
  private _appliedScaleY = 0;
  // Cached image data so scale changes don't re-fetch
  private _cachedImageData: Uint8Array | null = null;
  private _cachedWidth = 0;
  private _cachedHeight = 0;

  private _densityFn: (x: number, y: number, z: number) => number = () => 0;

  onRender(): void {
    if (this._loading) return;

    if (!this._initialized) {
      this._tryInit();
      return;
    }

    // Detect property changes
    if (this.heightmapUrl !== this._appliedUrl) {
      this._requestReinit(true);
    } else if (
      this.scaleX !== this._appliedScaleX ||
      this.scaleZ !== this._appliedScaleZ ||
      this.scaleY !== this._appliedScaleY
    ) {
      this._requestReinit(false);
    }
  }

  private _requestReinit(imageChanged: boolean): void {
    if (imageChanged) {
      this._cachedImageData = null;
    }
    const tw = this.gameObject.getComponent(TerrainWorld);
    if (tw) tw.reset();
    this._initialized = false;
  }

  private _tryInit(): void {
    const rs = RenderSystem.current;
    if (!rs) return;
    const scene = Scene.current;
    if (!scene) return;
    if (!this.heightmapUrl) return;

    this._loading = true;
    this._loadAndInit(rs, scene).catch((err) => {
      console.error("World2D: failed to load heightmap", err);
      this._loading = false;
    });
  }

  private async _loadAndInit(
    rs: InstanceType<typeof RenderSystem>,
    scene: import("@certe/atmos-core").Scene,
  ): Promise<void> {
    // Load image (use cache if only scale changed)
    if (!this._cachedImageData) {
      const resp = await fetch(this.heightmapUrl);
      const blob = await resp.blob();
      const { data, width, height } = await decodeImageToRGBA(blob);
      this._cachedImageData = data;
      this._cachedWidth = width;
      this._cachedHeight = height;
    }

    const hmData = imageToHeightmap(
      this._cachedImageData,
      this._cachedWidth,
      this._cachedHeight,
      { scaleX: this.scaleX, scaleZ: this.scaleZ, scaleY: this.scaleY },
    );
    this._densityFn = heightmapTerrain(hmData);

    const device = rs.device;
    const pipeline = rs.pipelineResources;

    let tw = this.gameObject.getComponent(TerrainWorld);
    if (!tw) {
      tw = this.gameObject.addComponent(TerrainWorld);
    }

    tw.config.chunkSize = 16;
    tw.config.voxelSize = 1;
    tw.config.smoothNormals = true;
    tw.config.normalEpsilon = 0.5;
    tw.loadRadius = this.loadRadius;
    tw.unloadRadius = this.unloadRadius;
    tw.maxBuildsPerFrame = this.maxBuildsPerFrame;
    tw.setDensityFn(this._densityFn);

    const terrainMat = createMaterial({
      albedo: [1, 1, 1, 1],
      roughness: 0.9,
      metallic: 0.0,
      splatSharpness: 4,
    });
    tw.init(device, pipeline, scene, terrainMat);

    const TEX_SIZE = 64;
    const splatTextures: SplatTextures = [
      createTextureFromRGBA(
        device,
        generateSolidTexture(80, 130, 50, 0.1, TEX_SIZE),
        TEX_SIZE,
        TEX_SIZE,
      ),
      createTextureFromRGBA(
        device,
        generateSolidTexture(120, 110, 100, 0.08, TEX_SIZE),
        TEX_SIZE,
        TEX_SIZE,
      ),
      createTextureFromRGBA(
        device,
        generateSolidTexture(220, 225, 230, 0.03, TEX_SIZE),
        TEX_SIZE,
        TEX_SIZE,
      ),
    ];
    const terrainPipeline = createTerrainPipeline(device, rs.format);
    tw.setSplatMaterials(terrainPipeline, splatTextures, weightFn);

    const centerX = (hmData.width * hmData.scaleX) / 2;
    const centerZ = (hmData.depth * hmData.scaleZ) / 2;
    tw.setFocus(centerX, 0, centerZ);

    // Snapshot applied values
    this._appliedUrl = this.heightmapUrl;
    this._appliedScaleX = this.scaleX;
    this._appliedScaleZ = this.scaleZ;
    this._appliedScaleY = this.scaleY;
    this._initialized = true;
    this._loading = false;
  }

  terrainDensity: (x: number, y: number, z: number) => number = (x, y, z) =>
    this._densityFn(x, y, z);
}
