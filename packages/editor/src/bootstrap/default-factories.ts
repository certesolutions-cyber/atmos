import { GameObject, getAllRegisteredComponents, applyComponentData } from '@certe/atmos-core';
import type { Component, DeserializeContext } from '@certe/atmos-core';
import type { MeshRendererContext, SkinnedRendererContext } from '@certe/atmos-renderer';
import {
  MeshRenderer, SkinnedMeshRenderer, Camera,
  DirectionalLight, PointLight, SpotLight, createMaterial,
} from '@certe/atmos-renderer';
import {
  AnimationMixer, AnimationHandler, createSkeleton, createAnimationClip,
} from '@certe/atmos-animation';
import type { Joint, KeyframeTrack, AnimationChannel } from '@certe/atmos-animation';
import type { ModelAsset } from '@certe/atmos-assets';
import type { PrimitiveType } from '../editor-mount.js';
import type { EditorState } from '../editor-state.js';
import type { MaterialManager } from '../material-manager.js';
import type { EditorPhysicsPlugin } from './types.js';
import type { Mesh } from '@certe/atmos-renderer';
import type { MeshRecord } from './geometry-cache.js';

const DEFAULT_MAT = { albedo: [0.7, 0.7, 0.7, 1] as [number, number, number, number], metallic: 0.0, roughness: 0.5 };
const DEFAULT_MAT_PATH = 'materials/default.mat.json';

export interface FactoryDeps {
  rendererCtx: MeshRendererContext;
  meshes: MeshRecord;
  physics: EditorPhysicsPlugin | undefined;
  /** Lazy ref — set after mountEditor returns, before any callback fires. */
  editorState: { current: EditorState | null };
  materialManager: { current: MaterialManager | null };
  loadModelMesh?: (source: string) => Promise<{
    mesh: Mesh; skinned: boolean; skinIndex?: number;
  } | null>;
  loadModelData?: (source: string) => Promise<{
    mesh: Mesh; asset: ModelAsset; meshIndex: number;
  } | null>;
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
        case 'SkinnedMeshRenderer': {
          const source = (data['meshSource'] as string) ?? '';
          if (source.startsWith('model:') && deps.loadModelData) {
            asyncLoads.push(
              deps.loadModelData(source).then((result) => {
                if (!result) return;
                const { mesh, asset, meshIndex } = result;
                const modelMesh = asset.meshes[meshIndex];
                if (!modelMesh?.skinned) return;
                const skinIdx = modelMesh.skinIndex ?? 0;
                const skin = asset.skins[skinIdx];
                if (!skin) return;

                // Resolve material
                const rawMat = data['materialSource'] as string | undefined;
                const matPath = rawMat?.endsWith('.mat.json') ? rawMat : DEFAULT_MAT_PATH;
                const mat = createMaterial(DEFAULT_MAT);

                const smr = go.addComponent(SkinnedMeshRenderer);
                smr.init(
                  deps.rendererCtx as MeshRendererContext & SkinnedRendererContext,
                  mesh, skin.jointNodeIndices.length, mat,
                );
                smr.meshSource = source;
                smr.materialSource = matPath;
                applyComponentData(smr, data);

                // Set up skeleton + AnimationMixer (mirrors model-instantiate setupSkinning)
                setupSkeletonFromSkin(go, asset, skin, skinIdx);

                // Add AnimationHandler on root to aggregate child mixers
                const root = findRoot(go);
                if (!root.getComponent(AnimationHandler)) {
                  const handler = root.addComponent(AnimationHandler);
                  const mixer = go.getComponent(AnimationMixer);
                  if (mixer?.initialClip) handler.initialClip = mixer.initialClip;
                }

                // Async material load
                const mm = deps.materialManager.current;
                if (mm && matPath) {
                  mm.getMaterial(matPath).then((m) => {
                    smr.material = m;
                    smr.materialBindGroup = null;
                  }).catch(() => {});
                }
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

// ---- Skinning helpers ---- //

import type { ModelSkin } from '@certe/atmos-assets';

function findRoot(go: GameObject): GameObject {
  let current = go;
  while (current.parent) current = current.parent;
  return current;
}

function setupSkeletonFromSkin(
  go: GameObject,
  asset: ModelAsset,
  skin: ModelSkin,
  _skinIdx: number,
): void {
  const joints: Joint[] = skin.jointParents.map((parentIdx, i) => ({
    name: skin.jointNames[i] ?? `joint_${i}`,
    parentIndex: parentIdx,
  }));

  const skeleton = createSkeleton(joints, skin.inverseBindMatrices, skin.restT, skin.restR, skin.restS);
  const mixer = go.addComponent(AnimationMixer);
  mixer.skeleton = skeleton;

  // Build node→joint mapping for animation track remapping
  const nodeToJoint = new Map<number, number>();
  for (let ji = 0; ji < skin.jointNodeIndices.length; ji++) {
    nodeToJoint.set(skin.jointNodeIndices[ji]!, ji);
  }

  for (const anim of asset.animations) {
    const tracks: KeyframeTrack[] = [];
    for (const track of anim.tracks) {
      const jointIndex = nodeToJoint.get(track.targetNode);
      if (jointIndex === undefined) continue;
      tracks.push({
        jointIndex,
        channel: track.path as AnimationChannel,
        interpolation: track.interpolation,
        times: track.times,
        values: track.values,
      });
    }
    if (tracks.length > 0) {
      const clip = createAnimationClip(anim.name, tracks);
      mixer.addClip(clip);
      if (!mixer.initialClip) {
        mixer.initialClip = clip.name;
      }
      if (mixer.layers.length === 0) {
        mixer.play(clip);
      }
    }
  }
}
