import { GameObject } from "@certe/atmos-core";
import { Vec3 } from "@certe/atmos-math";
import {
  createMaterial,
  createTerrainPipeline,
  createTextureFromRGBA,
  PipelineResources,
  TerrainPipelineResources,
} from "@certe/atmos-renderer";
import type { SplatWeightFn, SplatTextures } from "@certe/atmos-terrain";
import { startEditor } from "@certe/atmos-editor";
import { TerrainWorld, registerTerrainBuiltins } from "@certe/atmos-terrain";
import { terrainDensity } from "./scripts/terrain-density.js";
registerTerrainBuiltins();

// --- Procedural texture generation ---
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

// --- Splat weight function ---
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const weightFn: SplatWeightFn = (_nx, ny, _nz, y) => {
  const slope = Math.max(0, ny); // 0 = vertical, 1 = flat
  const grass = smoothstep(0.55, 0.85, slope);
  const snow = y > 10 ? smoothstep(10, 18, y) * slope : 0;
  const rock = Math.max(0, 1 - grass - snow);
  // w0 = grass, w1 = rock, w2(=snow) = 1 - w0 - w1
  return [grass, rock];
};

const terrainMat = createMaterial({
  albedo: [1, 1, 1, 1],
  roughness: 0.9,
  metallic: 0.0,
  splatSharpness: 4,
});

const TEX_SIZE = 64;
const grassPixels = generateSolidTexture(80, 130, 50, 0.1, TEX_SIZE);
const rockPixels = generateSolidTexture(120, 110, 100, 0.08, TEX_SIZE);
const snowPixels = generateSolidTexture(220, 225, 230, 0.03, TEX_SIZE);

// GPU resources — created once in setupScene, reused for loaded scenes
let splatTextures: SplatTextures;
let terrainPipeline: TerrainPipelineResources;

function initTerrainWorld(
  world: InstanceType<typeof TerrainWorld>,
  device: GPUDevice,
  pipeline: PipelineResources,
  scene: import("@certe/atmos-core").Scene,
): void {
  world.config.chunkSize = 16;
  world.config.voxelSize = 1;
  world.config.smoothNormals = true;
  world.config.normalEpsilon = 0.5;
  world.loadRadius = 12;
  world.unloadRadius = 14;
  world.maxBuildsPerFrame = 10;
  world.setDensityFn(terrainDensity);
  world.init(device, pipeline, scene, terrainMat);
  world.setSplatMaterials(terrainPipeline, splatTextures, weightFn);
}

const app = await startEditor({
  setupScene({ scene, gpu, pipeline }) {
    splatTextures = [
      createTextureFromRGBA(gpu.device, grassPixels, TEX_SIZE, TEX_SIZE),
      createTextureFromRGBA(gpu.device, rockPixels, TEX_SIZE, TEX_SIZE),
      createTextureFromRGBA(gpu.device, snowPixels, TEX_SIZE, TEX_SIZE),
    ] as SplatTextures;
    terrainPipeline = createTerrainPipeline(gpu.device, gpu.format);

    const terrainGo = new GameObject("Terrain");
    scene.add(terrainGo);
    const world = terrainGo.addComponent(TerrainWorld);
    initTerrainWorld(world, gpu.device, pipeline, scene);
    world.setFocus(20, 0, 20);
  },
});

// If a saved scene was loaded, find the TerrainWorld and wire up GPU + density.
const camera = app.renderSystem.camera;
const currentScene = app.editorState.scene;

for (const root of currentScene.roots) {
  const tw = root.getComponent(TerrainWorld);
  if (tw) {
    initTerrainWorld(
      tw,
      app.gpu.device,
      app.renderSystem.pipelineResources,
      currentScene,
    );
    break;
  }
}

// Position camera above the terrain
Vec3.set(camera.eye, 20, 30, 50);
Vec3.set(camera.target, 20, 0, 20);
if (app.orbitCamera) {
  Vec3.set(app.orbitCamera.target, 20, 0, 20);
}
