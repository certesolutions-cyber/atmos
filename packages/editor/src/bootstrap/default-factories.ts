import { GameObject, getAllRegisteredComponents, applyComponentData } from '@atmos/core';
import type { Component, DeserializeContext } from '@atmos/core';
import type { PipelineResources, GPUContext } from '@atmos/renderer';
import { MeshRenderer, Camera, createMaterial } from '@atmos/renderer';
import type { PrimitiveType } from '../editor-mount.js';
import type { EditorState } from '../editor-state.js';
import type { MaterialManager } from '../material-manager.js';
import type { EditorPhysicsPlugin } from './types.js';
import type { MeshRecord } from './geometry-cache.js';

const DEFAULT_MAT = { albedo: [0.7, 0.7, 0.7, 1] as const, metallic: 0.0, roughness: 0.5 };
const DEFAULT_MAT_PATH = 'materials/default.mat.json';

export interface FactoryDeps {
  gpu: GPUContext;
  pipeline: PipelineResources;
  meshes: MeshRecord;
  physics: EditorPhysicsPlugin | undefined;
  /** Lazy ref — set after mountEditor returns, before any callback fires. */
  editorState: { current: EditorState | null };
  materialManager: { current: MaterialManager | null };
}

// ---- Primitive factory ---- //

export function createDefaultPrimitiveFactory(deps: FactoryDeps) {
  return (type: PrimitiveType, name: string): GameObject => {
    const go = new GameObject(name);
    if (type === 'camera') {
      const cam = go.addComponent(Camera);
      const scene = deps.editorState.current?.scene;
      if (scene && !Camera.getMain(scene)) cam.isMainCamera = true;
    } else {
      const mr = go.addComponent(MeshRenderer);
      const mat = createMaterial(DEFAULT_MAT);
      mr.init(deps.gpu.device, deps.pipeline, deps.meshes[type], mat);
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
      mr.init(deps.gpu.device, deps.pipeline, deps.meshes.cube, mat);
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
  const nameToCtors = new Map<string, new () => Component>();
  for (const [ctor, def] of getAllRegisteredComponents()) {
    nameToCtors.set(def.name, ctor as new () => Component);
  }

  const deferredOps: Array<() => void> = [];
  const materialLoads: Array<Promise<void>> = [];

  return {
    onComponent(go: GameObject, type: string, data: Record<string, unknown>) {
      // Delegate physics types to plugin
      if (deps.physics?.handleDeserialize(go, type, data, deferredOps)) return;

      switch (type) {
        case 'MeshRenderer': {
          const mr = go.addComponent(MeshRenderer);
          const mat = createMaterial(DEFAULT_MAT);
          const source = (data['meshSource'] as string) ?? 'primitive:cube';
          const primName = source.startsWith('primitive:') ? source.slice(10) : 'cube';
          const mesh = deps.meshes[primName as keyof MeshRecord] ?? deps.meshes.cube;
          mr.init(deps.gpu.device, deps.pipeline, mesh, mat);
          mr.meshSource = source;
          const matPath = (data['materialSource'] as string) ?? DEFAULT_MAT_PATH;
          mr.materialSource = matPath;
          applyComponentData(mr, data);
          // Queue async material load
          const mm = deps.materialManager.current;
          if (mm && matPath) {
            materialLoads.push(
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
        default: {
          const ctor = nameToCtors.get(type);
          if (ctor) go.addComponent(ctor);
          break;
        }
      }
    },
    async onComplete() {
      if (deps.physics) deps.physics.flushDeferred(deferredOps);
      deferredOps.length = 0;
      await Promise.all(materialLoads);
      materialLoads.length = 0;
    },
  };
}
