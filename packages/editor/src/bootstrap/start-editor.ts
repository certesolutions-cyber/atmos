import { Engine, Scene, registerCoreBuiltins, deserializeScene, applyPostProcess } from '@atmos/core';
import type { PhysicsStepper } from '@atmos/core';
import {
  initWebGPU,
  createRenderPipeline,
  createDefaultCamera,
  createDirectionalLight,
  RenderSystem,
  MeshRenderer,
  SkinnedMeshRenderer,
  Camera,
  DirectionalLight,
  PointLight,
  SpotLight,
  registerRendererBuiltins,
  resizeGPU,
  createMesh,
  SKINNED_VERTEX_STRIDE_FLOATS,
} from '@atmos/renderer';
import type { ModelAsset } from '@atmos/assets';
import { Vec3 } from '@atmos/math';
import { parseGltfModel, instantiateModel } from '@atmos/assets';
import { AnimationMixer, AnimationHandler, registerAnimationBuiltins } from '@atmos/animation';
import { mountEditor } from '../editor-mount.js';
import type { EditorState } from '../editor-state.js';
import { ProjectFileSystem } from '../project-fs.js';
import { MaterialManager } from '../material-manager.js';
import { seedProject } from '../project-seed.js';
import { ProjectSettingsManager } from '../project-settings.js';
import { AssetBrowserClient } from '../asset-browser-client.js';
import { createGeometryCache } from './geometry-cache.js';
import {
  createDefaultPrimitiveFactory,
  createDefaultComponentFactory,
  createDefaultComponentFilter,
  createDefaultComponentRemover,
  createDefaultDeserializeContext,
} from './default-factories.js';
import type { FactoryDeps } from './default-factories.js';
import { installKeyboardShortcuts } from './keyboard-shortcuts.js';
import { setReparentValidator, setOnReparent, setOnDuplicate } from '../scene-operations.js';
import { discoverScripts, autoDiscoverScripts } from '../script-discovery.js';
import { importModelAssets } from './model-import.js';
import type { EditorConfig, EditorApp, MeshLike } from './types.js';

export async function startEditor(config: EditorConfig = {}): Promise<EditorApp> {
  const cleanups: Array<() => void> = [];

  // 1. Register component builtins
  registerCoreBuiltins();
  registerRendererBuiltins();
  registerAnimationBuiltins();

  // 2. DOM setup + WebGPU
  injectBaseStyles();
  const container = config.container ?? getOrCreateElement('div', 'editor-root');
  const canvas = config.canvas ?? getOrCreateElement('canvas', 'atmos-canvas') as HTMLCanvasElement;
  if (!canvas.parentElement) document.body.appendChild(canvas);
  if (!container.parentElement) document.body.appendChild(container);
  canvas.width = 800;
  canvas.height = 600;
  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);

  const resizeObs = new ResizeObserver(() => resizeGPU(gpu));
  resizeObs.observe(canvas);
  cleanups.push(() => resizeObs.disconnect());

  // 3. Geometry cache (shared primitive meshes)
  const meshes = createGeometryCache(gpu.device);

  // 4. Physics plugin init (optional)
  if (config.physics) {
    config.physics.init({
      meshes,
      getMesh(go): MeshLike | null {
        const mr = go.getComponent(MeshRenderer);
        return mr?.mesh ?? null;
      },
    });
  }

  // 5. Scene + camera + light + render system
  const scene = new Scene();
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 3, 4, 8);
  Vec3.set(camera.target, 0, 1, 0);
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.0);
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // 6. Physics stepper (optional)
  let physicsSystem: (PhysicsStepper & { scene: Scene }) | null = null;
  if (config.physics) {
    physicsSystem = config.physics.createStepper(scene);
  }

  // 7. ProjectFileSystem + MaterialManager (lazy — set after project opens)
  const projectFs = new ProjectFileSystem();
  const lazyState: { current: EditorState | null } = { current: null };
  const lazyMM: { current: MaterialManager | null } = { current: null };
  const lazySM: { current: ProjectSettingsManager | null } = { current: null };

  // Model mesh cache for deserialize (model:path.glb:index)
  const modelCache = new Map<string, ModelAsset>();

  const loadModelAsset = async (filePath: string): Promise<ModelAsset | null> => {
    let asset = modelCache.get(filePath);
    if (!asset) {
      const res = await fetch('/' + filePath);
      if (!res.ok) return null;
      asset = parseGltfModel(await res.arrayBuffer());
      modelCache.set(filePath, asset);
    }
    return asset;
  };

  const parseModelSource = (source: string): { path: string; index: number } | null => {
    const rest = source.slice(6); // strip "model:"
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return null;
    return { path: rest.slice(0, lastColon), index: parseInt(rest.slice(lastColon + 1), 10) };
  };

  const loadModelMesh = async (source: string): Promise<{
    mesh: import('@atmos/renderer').Mesh; skinned: boolean; skinIndex?: number;
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
    mesh: import('@atmos/renderer').Mesh; asset: ModelAsset; meshIndex: number;
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

  const factoryDeps: FactoryDeps = {
    rendererCtx: renderSystem, meshes,
    physics: config.physics,
    editorState: lazyState,
    materialManager: lazyMM,
    loadModelMesh,
    loadModelData,
  };

  const primitiveFactory = config.primitiveFactory ?? createDefaultPrimitiveFactory(factoryDeps);
  const componentFactory = config.componentFactory ?? createDefaultComponentFactory(factoryDeps);
  const componentFilter = createDefaultComponentFilter(factoryDeps);
  const componentRemover = createDefaultComponentRemover(factoryDeps);
  const deserializeCtx = config.deserializeContext ?? createDefaultDeserializeContext(factoryDeps);

  const onAttachScript = config.onAttachScript ?? ((script, go) => {
    go.addComponent(script.ctor);
  });

  // Helper: load a .glb and return the instantiated root GameObject
  const loadModel = async (path: string): Promise<import('@atmos/core').GameObject | null> => {
    try {
      const res = await fetch(`/${path}`);
      if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const name = path.split('/').pop()?.replace(/\.\w+$/, '') ?? 'Model';
      const asset = parseGltfModel(buffer, name);

      // Save textures + create .mat.json files if project is open
      let materialMap: Map<number, string> | null = null;
      const mm = lazyMM.current;
      if (mm && projectFs.isOpen) {
        materialMap = await importModelAssets(asset, name, projectFs, mm);
      }

      const root = await instantiateModel(asset, { renderSystem });

      // Tag MeshRenderers/SkinnedMeshRenderers with meshSource + assign material assets
      const tagMeshRenderers = async (
        go: import('@atmos/core').GameObject,
        modelPath: string,
        idx: { n: number },
      ) => {
        const mr = go.getComponent(MeshRenderer);
        const smr = go.getComponent(SkinnedMeshRenderer);
        const renderer = mr ?? smr;
        if (renderer) {
          renderer.meshSource = `model:${modelPath}:${idx.n}`;
          if (materialMap && mm) {
            const matIdx = asset.meshes[idx.n]?.materialIndex ?? 0;
            const matPath = materialMap.get(matIdx);
            if (matPath) {
              renderer.materialSource = matPath;
              const mat = await mm.getMaterial(matPath);
              renderer.material = mat;
              renderer.materialBindGroup = null;
            }
          }
          idx.n++;
        }
        for (const child of go.children) await tagMeshRenderers(child, modelPath, idx);
      };
      await tagMeshRenderers(root, path, { n: 0 });
      return root;
    } catch (err) {
      console.error('[Editor] Failed to load model:', err);
      return null;
    }
  };

  // Model loading callback for asset browser context menu / double-click
  const onLoadModel = async (entry: { path: string; name: string }) => {
    const root = await loadModel(entry.path);
    if (!root) return;
    const edState = lazyState.current;
    if (edState) {
      edState.scene.add(root);
      edState.select(root);
    }
  };

  // Drag-and-drop model callback (hierarchy or inspector)
  const onDropModel = async (path: string, target: import('@atmos/core').GameObject | null) => {
    const edState = lazyState.current;
    if (!edState) return;
    const root = await loadModel(path);
    if (!root) return;

    if (target) {
      // Inspector drop: if target has MeshRenderer, replace its mesh with first mesh from model
      const targetMr = target.getComponent(MeshRenderer);
      const sourceMr = root.getComponent(MeshRenderer);
      if (targetMr && sourceMr && sourceMr.mesh) {
        targetMr.mesh = sourceMr.mesh;
        targetMr.material = sourceMr.material;
        targetMr.materialBindGroup = null; // force re-creation with new texture
        targetMr.meshSource = sourceMr.meshSource;
        edState.notifyInspectorChanged();
      } else {
        // No MeshRenderer on target — add model as child
        root.setParent(target);
        edState.scene.add(root);
        edState.select(root);
      }
    } else {
      // Hierarchy drop with no parent — add to scene root
      edState.scene.add(root);
      edState.select(root);
    }
  };

  // 8b. ProjectFS lifecycle
  const initProject = async () => {
    await seedProject(projectFs);
    const mm = new MaterialManager(projectFs, gpu.device);
    lazyMM.current = mm;
    const sm = new ProjectSettingsManager(projectFs);
    await sm.load();
    lazySM.current = sm;
    config.physics?.applyPhysicsSettings?.(sm.settings.physics);
    sm.onChange(() => {
      config.physics?.applyPhysicsSettings?.(sm.settings.physics);
    });
    // setProjectFs triggers 'projectChanged' → EditorShell re-renders with gate gone
    lazyState.current?.setProjectFs(projectFs, mm);
    lazyState.current?.setSettingsManager(sm);
  };

  // Pre-init project before mount (so ProjectGate doesn't flash)
  // Priority: 1) Vite dev server  2) Restored FS handle  3) Show gate
  const devConnected = await projectFs.tryConnectDevServer();
  let preInited = false;
  const preInitProject = async () => {
    await seedProject(projectFs);
    const mm = new MaterialManager(projectFs, gpu.device);
    lazyMM.current = mm;
    const sm = new ProjectSettingsManager(projectFs);
    await sm.load();
    lazySM.current = sm;
    config.physics?.applyPhysicsSettings?.(sm.settings.physics);
    sm.onChange(() => {
      config.physics?.applyPhysicsSettings?.(sm.settings.physics);
    });
  };

  if (devConnected) {
    await preInitProject();
    preInited = true;
  } else {
    const restored = await projectFs.tryRestore();
    if (restored) {
      await preInitProject();
      preInited = true;
    }
  }

  // 8c. Mount editor UI
  const { editorState, gizmoState, orbitCamera, unmount } = mountEditor(
    container, scene, {
      canvas, camera, renderSystem,
      deserializeContext: deserializeCtx,
      projectFs,
      onOpenProject: async () => {
        const ok = await projectFs.open();
        if (!ok) return;
        await initProject();
      },
      showAssetBrowser: config.showAssetBrowser ?? true,
      onAttachScript,
      onLoadModel,
      onLoadScene: async (entry: { path: string; name: string }) => {
        const edState = lazyState.current;
        if (!edState || !projectFs.isOpen) return;
        try {
          const json = await projectFs.readTextFile(entry.path);
          const data = JSON.parse(json);
          const scene = deserializeScene(data, deserializeCtx);
          if (deserializeCtx.onComplete) await deserializeCtx.onComplete();
          const name = entry.name.replace(/\.scene\.json$/, '');
          edState.sceneName = name;
          edState.setScene(scene);
          if (data.postProcess && renderSystem) applyPostProcess(renderSystem as unknown as Record<string, unknown>, data.postProcess);
        } catch (err) {
          console.error('[Editor] Failed to load scene:', err);
        }
      },
      onDropModel,
      primitiveFactory,
      componentFactory,
      componentFilter,
      componentRemover,
      physics: config.physics,
    },
  );
  cleanups.push(unmount);
  lazyState.current = editorState;
  editorState.paused = true;

  // If pre-initialized before mount, set projectFs on editorState now
  if (preInited) {
    editorState.setProjectFs(projectFs, lazyMM.current!);
    if (lazySM.current) editorState.setSettingsManager(lazySM.current);
  }

  // 9. Physics reparent + duplicate hooks
  config.physics?.installReparentHooks(setReparentValidator, setOnReparent);
  if (config.physics) {
    setOnDuplicate((copy, source) => config.physics!.handleDuplicate(copy, source));
  }

  // 10. Asset browser + script discovery
  const assetClient = new AssetBrowserClient();
  await assetClient.init();

  // If project is open via dev server, show full project tree instead of just src/
  const loadProjectTree = async () => {
    if (projectFs.isServerMode) {
      try {
        const res = await fetch('/__atmos_fs/tree');
        if (res.ok) {
          const tree = await res.json();
          editorState.setAssetEntries(tree);
          return;
        }
      } catch { /* fall through */ }
    }
    editorState.setAssetEntries(assetClient.entries);
  };

  await loadProjectTree();
  assetClient.onChange(() => loadProjectTree());
  cleanups.push(() => assetClient.dispose());

  // Poll for external file changes every 2s
  const pollInterval = setInterval(() => loadProjectTree(), 2000);
  cleanups.push(() => clearInterval(pollInterval));

  // Refresh asset browser when project files change (write/delete via ProjectFileSystem)
  projectFs.onFileChanged = () => loadProjectTree();
  cleanups.push(() => { projectFs.onFileChanged = null; });

  // Also listen for project-change HMR events (materials, scenes, textures)
  const hmrMeta = import.meta as unknown as {
    hot?: { on(event: string, cb: (data: unknown) => void): void };
  };
  if (hmrMeta.hot) {
    hmrMeta.hot.on('atmos:project-change', () => {
      loadProjectTree();
    });
  }

  const scripts = config.scripts
    ?? (config.scriptModules ? discoverScripts(config.scriptModules) : null)
    ?? await autoDiscoverScripts(assetClient.entries);
  if (scripts.length > 0) editorState.setScriptAssets(scripts);

  // 11. Engine
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  if (physicsSystem) engine.setPhysics(physicsSystem);
  engine.input.attach(window);

  // 12. Keyboard shortcuts
  cleanups.push(installKeyboardShortcuts(editorState, gizmoState));

  // 13. Event wiring
  const unsubScene = editorState.on('sceneChanged', () => {
    const s = editorState.scene;
    renderSystem.scene = s;
    engine.scene = s;
    if (physicsSystem) physicsSystem.scene = s;
    config.physics?.onSceneChanged(s);
    if (!editorState.paused) {
      s.awakeAll();
      s.startAll();
    }
  });
  cleanups.push(unsubScene);

  engine.paused = true;

  // Skip GPU-owning and physics components when cycling play/pause lifecycle
  const isEngineComponent = (c: import('@atmos/core').Component) =>
    c instanceof MeshRenderer || c instanceof SkinnedMeshRenderer
    || c instanceof Camera || c instanceof DirectionalLight
    || c instanceof PointLight || c instanceof SpotLight
    || c instanceof AnimationMixer
    || c instanceof AnimationHandler
    || (config.physics?.isPhysicsComponent(c) ?? false);

  cleanups.push(editorState.on('pauseChanged', () => {
    engine.paused = editorState.paused;
    if (!editorState.paused) {
      // Entering play mode — teleport bodies + sync joints before first step
      config.physics?.onSceneRestored(editorState.scene);
      config.physics?.syncAllJoints?.(editorState.scene);
      // Awake + start all components
      editorState.scene.awakeAll();
      editorState.scene.startAll();
    }
  }));

  cleanups.push(editorState.on('sceneRestored', () => {
    // Destroy user script components (not GPU-owning ones) so they reset state
    editorState.scene.destroyAllComponents((c) => !isEngineComponent(c));
    // Reset all skinned meshes to rest pose
    for (const obj of editorState.scene.getAllObjects()) {
      const mixer = obj.getComponent(AnimationMixer);
      if (mixer) mixer.resetToRestPose();
    }
    config.physics?.onSceneRestored(editorState.scene);
  }));

  // 14. Setup scene (optional user callback)
  if (config.setupScene) {
    config.setupScene({ scene, gpu, pipeline, meshes });
  }

  // 15. Start engine (paused)
  engine.start(scene);

  // 16. Auto-load last active scene from session (after all wiring is in place)
  if (preInited) {
    const savedName = editorState.sceneName;
    const scenePath = `scenes/${savedName}.scene.json`;
    if (await projectFs.exists(scenePath)) {
      try {
        const json = await projectFs.readTextFile(scenePath);
        const data = JSON.parse(json);
        const loadedScene = deserializeScene(data, deserializeCtx);
        if (deserializeCtx.onComplete) await deserializeCtx.onComplete();
        editorState.setScene(loadedScene);
        if (data.postProcess) applyPostProcess(renderSystem as unknown as Record<string, unknown>, data.postProcess);
      } catch (err) {
        console.warn('[Editor] Failed to auto-load scene:', err);
      }
    }
  }

  // 17. Scene loader — allows scripts to call Scene.loadScene('name')
  Scene.setSceneLoader(async (name: string) => {
    const edState = lazyState.current;
    if (!edState || !projectFs.isOpen) return;
    const scenePath = `scenes/${name}.scene.json`;
    try {
      const json = await projectFs.readTextFile(scenePath);
      const data = JSON.parse(json);
      const loaded = deserializeScene(data, deserializeCtx);
      if (deserializeCtx.onComplete) await deserializeCtx.onComplete();
      edState.sceneName = name;
      edState.setScene(loaded);
      if (data.postProcess) applyPostProcess(renderSystem as unknown as Record<string, unknown>, data.postProcess);
    } catch (err) {
      console.error(`[Scene] Failed to load scene "${name}":`, err);
    }
  });
  cleanups.push(() => Scene.setSceneLoader(null));

  return {
    editorState,
    engine,
    gizmoState,
    orbitCamera,
    renderSystem,
    scene,
    gpu,
    projectFs,
    get materialManager() { return lazyMM.current; },
    async openProject(): Promise<boolean> {
      const ok = await projectFs.open();
      if (!ok) return false;
      await initProject();
      return true;
    },
    dispose() {
      engine.stop();
      for (const fn of cleanups) fn();
      cleanups.length = 0;
    },
  };
}

// ---- DOM helpers ---- //

const BASE_STYLES = `*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;background:#111;overflow:hidden}#editor-root{width:100%;height:100vh}#atmos-canvas{position:absolute;visibility:hidden}`;

function injectBaseStyles(): void {
  if (document.getElementById('atmos-base-styles')) return;
  const style = document.createElement('style');
  style.id = 'atmos-base-styles';
  style.textContent = BASE_STYLES;
  document.head.appendChild(style);
}

function getOrCreateElement<K extends keyof HTMLElementTagNameMap>(
  tag: K, id: string,
): HTMLElementTagNameMap[K] {
  const existing = document.getElementById(id);
  if (existing) return existing as HTMLElementTagNameMap[K];
  const el = document.createElement(tag);
  el.id = id;
  return el;
}
