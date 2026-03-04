import { Scene } from "@certe/atmos-core";
import type { PropertyDef } from "@certe/atmos-core";
import {
  createMaterial,
  createTerrainPipeline,
  createTextureFromRGBA,
  RenderSystem,
} from "@certe/atmos-renderer";
import type { SplatWeightFn, SplatTextures } from "@certe/atmos-terrain";
import { TerrainWorld } from "@certe/atmos-terrain";

import { fbm3D } from "@certe/atmos-math";
import type { DensityFn } from "@certe/atmos-terrain";
import { TerrainDensityProvider } from "./terrainDensityProvider";

const NOISE_SCALE = 0.02;
const SEA_LEVEL = 0;
const DEPTH_WEIGHT = 0.04;

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
 * Sets up TerrainWorld on this GameObject with density, splat materials, and config.
 * Attach to a GameObject that also has (or will get) a TerrainWorld component.
 */
export class World extends TerrainDensityProvider {
  loadRadius = 12;
  unloadRadius = 14;
  maxBuildsPerFrame = 10;

  static editorProperties: PropertyDef[] = [
    { key: "loadRadius", type: "number", min: 1, max: 32, step: 1 },
    { key: "unloadRadius", type: "number", min: 2, max: 40, step: 1 },
    { key: "maxBuildsPerFrame", type: "number", min: 1, max: 30, step: 1 },
  ];

  private _initialized = false;

  get ready(): boolean { return this._initialized; }

  onRender(): void {
    if (!this._initialized) this._tryInit();
  }

  terrainDensity: DensityFn = (x, y, z) => {
    const nx = x * NOISE_SCALE;
    const ny = y * NOISE_SCALE;
    const nz = z * NOISE_SCALE;

    const n = fbm3D(nx, ny, nz, 5, 2.0, 0.5);
    const bias = (y - SEA_LEVEL) * DEPTH_WEIGHT;

    return bias + n;
  };

  private _tryInit(): void {
    const rs = RenderSystem.current;
    if (!rs) return;

    const device = rs.device;
    const pipeline = rs.pipelineResources;
    const scene = Scene.current;
    if (!scene) return;

    // Ensure TerrainWorld component exists
    let tw = this.gameObject.getComponent(TerrainWorld);
    if (!tw) {
      tw = this.gameObject.addComponent(TerrainWorld);
    }

    // Config
    tw.config.chunkSize = 16;
    tw.config.voxelSize = 1;
    tw.config.smoothNormals = true;
    tw.config.normalEpsilon = 0.5;
    tw.loadRadius = this.loadRadius;
    tw.unloadRadius = this.unloadRadius;
    tw.maxBuildsPerFrame = this.maxBuildsPerFrame;

    // Density
    tw.setDensityFn(this.terrainDensity);

    // Material
    const terrainMat = createMaterial({
      albedo: [1, 1, 1, 1],
      roughness: 0.9,
      metallic: 0.0,
      splatSharpness: 4,
    });

    tw.init(device, pipeline, scene, terrainMat);

    // Splat textures
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

    tw.setFocus(20, 0, 20);
    this._initialized = true;
  }
}
