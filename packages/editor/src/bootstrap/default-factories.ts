import { GameObject, getAllRegisteredComponents, applyComponentData } from '@atmos/core';
import type { Component, DeserializeContext } from '@atmos/core';
import type { MeshRendererContext } from '@atmos/renderer';
import { MeshRenderer, Camera, DirectionalLight, PointLight, SpotLight, createMaterial } from '@atmos/renderer';
import type { PrimitiveType } from '../editor-mount.js';
import type { EditorState } from '../editor-state.js';
import type { MaterialManager } from '../material-manager.js';
import type { EditorPhysicsPlugin } from './types.js';
import type { Mesh } from '@atmos/renderer';
import type { MeshRecord } from './geometry-cache.js';

const DEFAULT_MAT = { albedo: [0.7, 0.7, 0.7, 1] as const, metallic: 0.0, roughness: 0.5 };
const DEFAULT_MAT_PATH = 'materials/default.mat.json';

export interface FactoryDeps {
  rendererCtx: MeshRendererContext;
  meshes: MeshRecord;
  physics: EditorPhysicsPlugin | undefined;
  /** Lazy ref — set after mountEditor returns, before any callback fires. */
  editorState: { current: EditorState | null };
  materialManager: { current: MaterialManager | null };
  loadModelMesh?: (source: string) => Promise<{ mesh: Mesh } | null>;
}

// ---- Primitive factory ---- //

export function createDefaultPrimitiveFactory(deps: FactoryDeps) {
  return (type: PrimitiveType, name: string): GameObject => {
    const go = new GameObject(name);
    if (type === 'camera') {
      const cam = go.addComponent(Camera);
      const scene = deps.editorState.current?.scene;
      if (scene && !Camera.getMain(scene)) cam.isMainCamera = true;
    } else if (type === 'directionalLight') {
      go.addComponent(DirectionalLight);
    } else if (type === 'pointLight') {
      go.addComponent(PointLight);
    } else if (type === 'spotLight') {
      go.addComponent(SpotLight);
    } else {
      const mr = go.addComponent(MeshRenderer);
      const mat = createMaterial(DEFAULT_MAT);
      mr.init(deps.rendererCtx, deps.meshes[type], mat);
      mr.meshSource = `primitive:${type}`;
      mr.materialSource = DEFAULT_MAT_PATH;
      // Async: load shared material from manager
      const mm = deps.materialManager.current;
      if (mm) {
        mm.getMaterial(DEFAULT_MAT_PATH).then((m) => {
          mr.material = m;
          mr.materialBindGroup = null;
        }).catch(() => {});
      }
    }
    return go;
  };
}

// ---- Component factory ---- //

export function createDefaultComponentFactory(deps: FactoryDeps) {
  return (ctor: new () => Component, go: GameObject): void => {
    // Delegate to physics plugin first (RigidBody, Collider, Joint)
    if (deps.physics?.handleAddComponent(ctor, go)) return;

    if (ctor === MeshRenderer) {
      const mr = go.addComponent(MeshRenderer);
      const mat = createMaterial(DEFAULT_MAT);
      mr.init(deps.rendererCtx, deps.meshes.cube, mat);
      mr.meshSource = 'primitive:cube';
      mr.materialSource = DEFAULT_MAT_PATH;
      const mm = deps.materialManager.current;
      if (mm) {
        mm.getMaterial(DEFAULT_MAT_PATH).then((m) => {
          mr.material = m;
          mr.materialBindGroup = null;
        }).catch(() => {});
      }
    } else if (ctor === (Camera as unknown)) {
      const cam = go.addComponent(Camera);
      const scene = deps.editorState.current?.scene;
      if (scene && !Camera.getMain(scene)) cam.isMainCamera = true;
    } else {
      go.addComponent(ctor);
    }
  };
}

// ---- Component filter ---- //

export function createDefaultComponentFilter(deps: FactoryDeps) {
  return (ctor: new () => Component, go: GameObject): string | null => {
    return deps.physics?.canAddComponent(ctor, go) ?? null;
  };
}

// ---- Component remover ---- //

export function createDefaultComponentRemover(deps: FactoryDeps) {
  return (comp: Component, go: GameObject): void => {
    if (deps.physics?.handleRemoveComponent(comp, go)) return;
    go.removeComponent(comp);
  };
}

// ---- Deserialize context ---- //

export function createDefaultDeserializeContext(deps: FactoryDeps): DeserializeContext {
  let nameToCtors: Map<string, new () => Component> | null = null;
  const getCtorMap = () => {
    if (!nameToCtors) {
      nameToCtors = new Map();
      for (const [ctor, def] of getAllRegisteredComponents()) {
        nameToCtors.set(def.name, ctor as new () => Component);
      }
    }
    return nameToCtors;
  };

  const deferredOps: Array<() => void> = [];
  const asyncLoads: Array<Promise<void>> = [];

  return {
    onComponent(go: GameObject, type: string, data: Record<string, unknown>) {
      // Delegate physics types to plugin
      if (deps.physics?.handleDeserialize(go, type, data, deferredOps)) return;

      switch (type) {
        case 'MeshRenderer': {
          const mr = go.addComponent(MeshRenderer);
          const mat = createMaterial(DEFAULT_MAT);
          const source = (data['meshSource'] as string) ?? 'primitive:cube';
          // Resolve mesh: primitive or placeholder for model
          const primName = source.startsWith('primitive:') ? source.slice(10) : 'cube';
          const mesh = deps.meshes[primName as keyof MeshRecord] ?? deps.meshes.cube;
          mr.init(deps.rendererCtx, mesh, mat);
          mr.meshSource = source;
          const rawMat = data['materialSource'] as string | undefined;
          const matPath = rawMat?.endsWith('.mat.json') ? rawMat : DEFAULT_MAT_PATH;
          mr.materialSource = matPath;
          applyComponentData(mr, data);
          // Queue async model mesh load if source is model:*
          if (source.startsWith('model:') && deps.loadModelMesh) {
            asyncLoads.push(
              deps.loadModelMesh(source).then((result) => {
                if (result) mr.mesh = result.mesh;
              }).catch(() => {}),
            );
          }
          // Queue async material load
          const mm = deps.materialManager.current;
          if (mm && matPath) {
            asyncLoads.push(
              mm.getMaterial(matPath).then((m) => {
                mr.material = m;
                mr.materialBindGroup = null;
              }).catch(() => {}),
            );
          }
          break;
        }
        case 'Camera': {
          const cam = go.addComponent(Camera);
          applyComponentData(cam, data);
          break;
        }
        case 'DirectionalLight': {
          const dl = go.addComponent(DirectionalLight);
          applyComponentData(dl, data);
          break;
        }
        case 'PointLight': {
          const pl = go.addComponent(PointLight);
          applyComponentData(pl, data);
          break;
        }
        case 'SpotLight': {
          const sl = go.addComponent(SpotLight);
          applyComponentData(sl, data);
          break;
        }
        default: {
          const ctor = getCtorMap().get(type);
          if (ctor) {
            const comp = go.addComponent(ctor);
            applyComponentData(comp, data);
          }
          break;
        }
      }
    },
    async onComplete() {
      if (deps.physics) deps.physics.flushDeferred(deferredOps);
      deferredOps.length = 0;
      await Promise.all(asyncLoads);
      asyncLoads.length = 0;
      nameToCtors = null; // invalidate so next deserialize picks up newly registered scripts
    },
  };
}
