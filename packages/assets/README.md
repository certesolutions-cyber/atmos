# 📦 @atmos/assets

glTF 2.0 / GLB asset pipeline for the Atmos Engine. Parses binary glTF into a CPU-only `ModelAsset`, then instantiates it as a live `GameObject` hierarchy with GPU resources — meshes, materials, textures, skeletal skins, and animation clips.

---

## 🔑 Two-Stage Pipeline

```
ArrayBuffer  →  parseGltfModel()  →  ModelAsset (CPU-only)
                                          ↓
                                   instantiateModel()  →  GameObject (GPU-ready)
```

**Stage 1** is thread-safe (no GPU access). **Stage 2** uploads to the GPU and creates engine components.

---

## 🚀 Quick Start

```ts
import { parseGltfModel, instantiateModel } from '@atmos/assets';

// Load a .glb file
const buffer = await fetch('/models/character.glb').then(r => r.arrayBuffer());

// Parse (CPU-only, no GPU needed)
const asset = parseGltfModel(buffer, 'Character');

// Instantiate into the scene
const root = await instantiateModel(asset, { renderSystem });
scene.add(root);
```

For skinned meshes, `instantiateModel` automatically creates `SkinnedMeshRenderer` and `AnimationMixer` components, and auto-plays the first animation clip.

---

## 📖 API Overview

### Core Functions

| Function | Description |
|---|---|
| `parseGltfModel(buffer, name?)` | Parse GLB → `ModelAsset` |
| `instantiateModel(asset, options)` | Create GameObject tree with GPU resources |

### ModelAsset Contents

| Field | Description |
|---|---|
| `meshes: ModelMesh[]` | Geometry data (32B standard or 52B skinned stride) |
| `materials: ModelMaterial[]` | PBR params + texture indices |
| `textures: ModelTexture[]` | CPU-side image bytes |
| `rootNodes: ModelNode[]` | Scene hierarchy with TRS |
| `skins: ModelSkin[]` | Joint hierarchies + inverse bind matrices |
| `animations: ModelAnimation[]` | Keyframe tracks per joint |

### Skinned Mesh Support

When a mesh has `JOINTS_0` and `WEIGHTS_0` attributes:

- Vertices are interleaved into a **52-byte format**: position(3) + normal(3) + uv(2) + joints(u8×4) + weights(f32×4)
- `ModelMesh.skinned = true` and `skinIndex` links to the skin data
- `instantiateModel()` creates a `SkinnedMeshRenderer` with a bone buffer, and an `AnimationMixer` pre-loaded with all clips

### Low-Level Parser API

For advanced use cases:

```ts
import { parseGlb, readAccessor, readBufferView } from '@atmos/assets';

const doc = parseGlb(buffer);              // { json, buffers }
const positions = readAccessor(doc, 0);     // Float32Array
const imageBytes = readBufferView(doc, 2);  // Uint8Array
```

| Function | Description |
|---|---|
| `parseGlb(buffer)` | Parse GLB container |
| `parseGltfJson(json, buffers?)` | Wrap standalone .gltf |
| `readAccessor(doc, index)` | Read typed array from accessor |
| `readBufferView(doc, index)` | Read raw bytes from buffer view |
| `extractSkins(doc)` | Extract skin data (joints, IBM, rest pose) |
| `extractAnimations(doc)` | Extract animation clips |

---

## 🧠 Design Notes

- **Custom parser** (~350 lines) — no external glTF dependencies
- Interleaves vertex attributes into engine-native stride formats
- Supports indexed meshes with both `Uint16Array` and `Uint32Array` indices
- PBR metallic-roughness workflow with embedded texture extraction
- Node hierarchy preserved with TRS decomposition

---

## 📁 Structure

```
packages/assets/src/
  index.ts             # Public API
  types.ts             # ModelAsset, ModelMesh, ModelSkin, etc.
  gltf-parser.ts       # GLB/glTF binary parser
  gltf-mesh.ts         # Mesh extraction + vertex interleaving
  gltf-material.ts     # Material extraction
  gltf-scene.ts        # Scene graph assembly
  gltf-skin.ts         # Skin extraction (joints, IBM, rest pose)
  gltf-animation.ts    # Animation channel extraction
  model-instantiate.ts # GPU instantiation + component creation
```

---

## 🔗 Dependencies

- `@atmos/core` — GameObject, Component, Transform
- `@atmos/math` — Vec3, Mat4, Quat
- `@atmos/renderer` — Mesh, Material, MeshRenderer, SkinnedMeshRenderer, textures
- `@atmos/animation` — Skeleton, AnimationClip, AnimationMixer
