import { Engine, Scene, registerCoreBuiltins, deserializeScene, applyPostProcess } from '@certe/atmos-core';
import type { PhysicsStepper } from '@certe/atmos-core';
import {
  initWebGPU,
  createRenderPipeline,
  createDefaultCamera,
  createDirectionalLight,
  RenderSystem,
  MeshRenderer,
  Camera,
  registerRendererBuiltins,
  resizeGPU,
  createMesh,
  SKINNED_VERTEX_STRIDE_FLOATS,
} from '@certe/atmos-renderer';
import type { ModelAsset } from '@certe/atmos-assets';
import { Vec3 } from '@certe/atmos-math';
import { parseGltfModel } from '@certe/atmos-assets';
import { registerAnimationBuiltins } from '@certe/atmos-animation';
import { createGeometryCache } from './geometry-cache.js';
import { createDefaultDeserializeContext } from './default-factories.js';
import type { FactoryDeps } from './default-factories.js';
import { discoverScripts } from '../script-discovery.js';
import { SimpleMaterialLoader } from '../simple-material-loader.js';
import type { EditorPhysicsPlugin, MeshLike } from './types.js';

export interface PlayerConfig {
  /** Path to .scene.json (fetched via HTTP). */
  scene: string;
  /** Canvas element (auto-created fullscreen if omitted). */
  canvas?: HTMLCanvasElement;
  /** Physics plugin (from createEditorPhysics()). */
  physics?: EditorPhysicsPlugin;
  /** User script modules from import.meta.glob('./scripts/*.ts', { eager: true }). */
  scriptModules?: Record<string, Record<string, unknown>>;
  /** Base URL prefix for asset fetches (default: '/'). */
  assetBase?: string;
}

export interface PlayerApp {
  engine: Engine;
  renderSystem: RenderSystem;
  scene: Scene;
  dispose(): void;
}

export async function startPlayer(config: PlayerConfig): Promise<PlayerApp> {
  const cleanups: Array<() => void> = [];
  const assetBase = config.assetBase ?? '/';

  // 1. Register builtins
  registerCoreBuiltins();
  registerRendererBuiltins();
  registerAnimationBuiltins();

  // 2. Discover user scripts
  if (config.scriptModules) {
    discoverScripts(config.scriptModules);
  }

  // 3. Canvas + WebGPU (prefer existing DOM element, then config, then create)
  const canvas = config.canvas
    ?? document.getElementById('atmos-canvas') as HTMLCanvasElement
    ?? createFullscreenCanvas();
  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);

  const resizeObs = new ResizeObserver(() => resizeGPU(gpu));
  resizeObs.observe(canvas);
  cleanups.push(() => resizeObs.disconnect());

  // 4. Geometry cache
  const meshes = createGeometryCache(gpu.device);

  // 5. Physics plugin init (optional)
  if (config.physics) {
    config.physics.init({
      meshes,
      getMesh(go): MeshLike | null {
        const mr = go.getComponent(MeshRenderer);
        return mr?.mesh ?? null;
      },
    });
  }

  // 6. Scene + camera + light + render system
  const scene = new Scene();
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 3, 4, 8);
  Vec3.set(camera.target, 0, 1, 0);
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.0);
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // 7. Physics stepper (optional)
  let physicsSystem: (PhysicsStepper & { scene: Scene }) | null = null;
  if (config.physics) {
    physicsSystem = config.physics.createStepper(scene);
  }

  // 8. Material loader
  const materialLoader = new SimpleMaterialLoader(gpu.device, assetBase);

  // 9. Model loading helpers
  const modelCache = new Map<string, ModelAsset>();

  const loadModelAsset = async (filePath: string): Promise<ModelAsset | null> => {
    let asset = modelCache.get(filePath);
    if (!asset) {
      const res = await fetch(assetBase + filePath);
      if (!res.ok) return null;
      asset = parseGltfModel(await res.arrayBuffer());
      modelCache.set(filePath, asset);
    }
    return asset;
  };

  const parseModelSource = (source: string): { path: string; index: number } | null => {
    const rest = source.slice(6);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return null;
    return { path: rest.slice(0, lastColon), index: parseInt(rest.slice(lastColon + 1), 10) };
  };

  const loadModelMesh = async (source: string): Promise<{
    mesh: import('@certe/atmos-renderer').Mesh; skinned: boolean; skinIndex?: number;
  } | null> => {
    const parsed = parseModelSource(source);
    if (!parsed) return null;
    const asset = await loadModelAsset(parsed.path);
    if (!asset) return null;
    const meshData = asset.meshes[parsed.index];
    if (!meshData) return null;
    const stride = meshData.skinned ? SKINNED_VERTEX_STRIDE_FLOATS : 8;
    const mesh = createMesh(gpu.device, meshData.geometry.vertices, meshData.geometry.indices, stride);
    mesh.bounds = meshData.geometry.bounds;
    return { mesh, skinned: meshData.skinned, skinIndex: meshData.skinIndex };
  };

  const loadModelData = async (source: string): Promise<{
    mesh: import('@certe/atmos-renderer').Mesh; asset: ModelAsset; meshIndex: number;
  } | null> => {
    const parsed = parseModelSource(source);
    if (!parsed) return null;
    const asset = await loadModelAsset(parsed.path);
    if (!asset) return null;
    const meshData = asset.meshes[parsed.index];
    if (!meshData) return null;
    const stride = meshData.skinned ? SKINNED_VERTEX_STRIDE_FLOATS : 8;
    const mesh = createMesh(gpu.device, meshData.geometry.vertices, meshData.geometry.indices, stride);
    mesh.bounds = meshData.geometry.bounds;
    return { mesh, asset, meshIndex: parsed.index };
  };

  // 10. Deserialize context (reuses default-factories)
  const lazyMM = { current: materialLoader as unknown as import('../material-manager.js').MaterialManager };
  const factoryDeps: FactoryDeps = {
    rendererCtx: renderSystem,
    meshes,
    physics: config.physics,
    editorState: { current: null },
    materialManager: lazyMM,
    loadModelMesh,
    loadModelData,
  };
  const deserializeCtx = createDefaultDeserializeContext(factoryDeps);

  // 11. Fetch + deserialize scene
  const sceneRes = await fetch(assetBase + config.scene);
  if (!sceneRes.ok) throw new Error(`Failed to fetch scene: ${config.scene}`);
  const sceneData = JSON.parse(await sceneRes.text());
  const loadedScene = deserializeScene(sceneData, deserializeCtx);
  if (deserializeCtx.onComplete) await deserializeCtx.onComplete();

  // 12. Switch render system to loaded scene + activate camera
  renderSystem.scene = loadedScene;
  const mainCam = Camera.getMain(loadedScene);
  if (mainCam) {
    renderSystem.activeCamera = mainCam;
  }

  // 13. Apply post-process settings
  if (sceneData.postProcess) {
    applyPostProcess(renderSystem as unknown as Record<string, unknown>, sceneData.postProcess);
  }

  // 14. Engine setup
  if (physicsSystem) physicsSystem.scene = loadedScene;
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  if (physicsSystem) engine.setPhysics(physicsSystem);
  engine.input.attach(window);
  cleanups.push(() => engine.input.detach());

  // 15. Scene loader for runtime scene switching
  Scene.setSceneLoader(async (name: string) => {
    const scenePath = `scenes/${name}.scene.json`;
    try {
      const res = await fetch(assetBase + scenePath);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = JSON.parse(await res.text());
      const newScene = deserializeScene(data, deserializeCtx);
      if (deserializeCtx.onComplete) await deserializeCtx.onComplete();
      renderSystem.scene = newScene;
      engine.scene = newScene;
      if (physicsSystem) physicsSystem.scene = newScene;
      config.physics?.onSceneChanged(newScene);
      if (data.postProcess) {
        applyPostProcess(renderSystem as unknown as Record<string, unknown>, data.postProcess);
      }
      const cam = Camera.getMain(newScene);
      if (cam) renderSystem.activeCamera = cam;
      newScene.awakeAll();
      newScene.startAll();
    } catch (err) {
      console.error(`[Player] Failed to load scene "${name}":`, err);
    }
  });
  cleanups.push(() => Scene.setSceneLoader(null));

  // 16. Start engine
  engine.start(loadedScene);

  return {
    engine,
    renderSystem,
    scene: loadedScene,
    dispose() {
      engine.stop();
      for (const fn of cleanups) fn();
      cleanups.length = 0;
    },
  };
}

function createFullscreenCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = 'atmos-player-canvas';
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'block',
  });
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(canvas);
  return canvas;
}
