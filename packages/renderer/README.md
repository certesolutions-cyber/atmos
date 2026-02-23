# 🎨 @atmos/renderer

WebGPU-first rendering package for the Atmos Engine. Handles GPU initialization, PBR shading, multi-light systems, cascaded shadow maps, skeletal animation (GPU skinning), terrain rendering, and a full HDR post-processing pipeline.

---

## 🔑 Key Features

- **PBR Cook-Torrance** shading with albedo, metallic, roughness, normal, and emissive maps
- **3 light types** — Directional, Point, Spot (up to 4 each)
- **Cascaded Shadow Maps** (2-cascade CSM) + point cube shadows + spot shadows
- **HDR pipeline** — MSAA 4× → HDR resolve → Bloom → SSAO → Tonemapping (ACES)
- **GPU skinning** — separate skinned pipeline with bone matrix storage buffer
- **Terrain pipeline** — splat-textured terrain with 3-layer blending
- **Geometry primitives** — cube, sphere, cylinder, plane

---

## 🚀 Quick Start

```ts
import { initWebGPU, createRenderPipeline, createMesh, createMaterial,
         RenderSystem, Camera, MeshRenderer, createCubeGeometry } from '@atmos/renderer';

const gpu = await initWebGPU(canvas);
const pipeline = createRenderPipeline(gpu);

// Create a mesh + material
const mesh = createMesh(gpu.device, createCubeGeometry());
const material = createMaterial(gpu.device, pipeline, {
  albedo: [0.8, 0.2, 0.2, 1],
  metallic: 0.0,
  roughness: 0.5,
});

// Attach to a GameObject
const cube = new GameObject('Cube');
const mr = cube.addComponent(MeshRenderer);
mr.init({ mesh, material, device: gpu.device, pipelineResources: pipeline });

// Render
const renderSystem = new RenderSystem(gpu, pipeline, scene);
```

---

## 📖 API Overview

### Initialization

| Function | Description |
|---|---|
| `initWebGPU(canvas)` | Request adapter + device, configure canvas |
| `resizeGPU(gpu)` | Sync canvas pixel size, recreate depth/MSAA/HDR textures |
| `createRenderPipeline(gpu)` | Create the PBR render pipeline + bind group layouts |

### Geometry & Mesh

| Function | Description |
|---|---|
| `createCubeGeometry()` | 32B/vertex (pos+normal+uv) |
| `createSphereGeometry(seg?)` | Latitude-longitude sphere |
| `createCylinderGeometry(seg?)` | With top/bottom caps |
| `createPlaneGeometry(size?)` | XZ plane |
| `createMesh(device, geo)` | Upload to GPU, retains CPU data for picking |

### Materials

```ts
const mat = createMaterial(device, pipeline, {
  albedo: [1, 1, 1, 1],
  metallic: 0.5,
  roughness: 0.3,
  emissive: [1, 0.5, 0],
  emissiveIntensity: 2.0,
});
// Textures: mat.albedoTexture, mat.normalTexture, mat.metallicRoughnessTexture
```

### Lights

```ts
// Add as components to GameObjects
const light = obj.addComponent(DirectionalLight);
light.color = new Float32Array([1, 1, 1]);
light.intensity = 1.5;
light.castShadows = true;

obj.addComponent(PointLight);   // color, intensity, range
obj.addComponent(SpotLight);    // + innerAngle, outerAngle
```

### Camera

```ts
const cam = obj.addComponent(Camera);
cam.fov = 60;
cam.near = 0.1;
cam.far = 1000;

// Screen-to-world unprojection
const worldPos = Camera.screenToWorldPoint(sx, sy, depth, camera, canvas);
```

### Post-Processing

The RenderSystem exposes controls for the full post-fx chain:

| Property | Default | Description |
|---|---|---|
| `exposure` | `1.0` | Pre-tonemap multiplier |
| `bloomIntensity` | `0.04` | Bloom strength |
| `bloomThreshold` | `1.0` | HDR threshold for bloom |
| `ssaoEnabled` | `false` | Toggle SSAO |
| `ssaoRadius` / `ssaoBias` / `ssaoIntensity` | — | SSAO tuning |
| `vignetteIntensity` / `vignetteRadius` | — | Screen-edge darkening |

### Render Pipeline Flow

```
Depth Pre-pass
Shadow Passes (CSM × 2 + Point + Spot)
Main Pass (MSAA 4× → HDR resolve)
SSAO (half-res, 16 samples)
Bloom (5-level downsample/upsample)
Tonemap (ACES + gamma 2.2 + vignette) → Swapchain
```

---

## 📁 Structure

```
packages/renderer/src/
  index.ts                # Public API
  pipeline.ts             # PBR pipeline, constants (HDR_FORMAT, MSAA_SAMPLE_COUNT)
  shader.ts               # PBR WGSL vertex + fragment shaders
  material.ts             # Material creation + uniform writes
  camera.ts               # Camera component
  render-system.ts        # Frame orchestration
  directional-light.ts    # DirectionalLight component
  point-light.ts          # PointLight component
  spot-light.ts           # SpotLight component
  geometry.ts             # Primitive factories
  mesh.ts                 # GPU mesh creation
  mesh-renderer.ts        # MeshRenderer component
  skinned-pipeline.ts     # GPU skinning pipeline
  skinned-mesh-renderer.ts # SkinnedMeshRenderer component
  bloom-pass.ts           # 5-level bloom
  tonemap-pass.ts         # ACES tonemapping + vignette
  ssao-pass.ts            # Screen-space ambient occlusion
  depth-prepass.ts        # Non-MSAA depth for SSAO
  directional-shadow-pass.ts # Cascaded shadow maps
  point-shadow-pass.ts    # Cube shadow maps
  spot-shadow-pass.ts     # Spot light shadows
  texture.ts              # Texture creation + decoding
  mipmap-generator.ts     # Blit-based mipmap generation
  grid-renderer.ts        # Infinite XZ grid overlay
```

---

## 🔗 Dependencies

- `@atmos/core` — Component, GameObject, Transform, Scene
- `@atmos/math` — Vec3, Mat4, Quat for camera/light math
