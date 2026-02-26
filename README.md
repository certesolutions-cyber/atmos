# 🌌 Atmos Engine

Atmos is an open-source, web-native game engine built on top of **WebGPU**, **TypeScript**, and **Vite**.
It brings a Unity-style component workflow directly into the browser, powered by the npm ecosystem.

The project is designed for:

- 🔬 Experimental rendering (WebGPU-first)
- 🧩 Modular architecture (monorepo, plug-and-play packages)
- 🤖 AI-agent-friendly development (clear contracts, strict typing, deterministic architecture)
- 🌍 Open web platform

---

# 🎯 Vision

Atmos aims to become:

1. A **WebGPU-first game engine**
2. A **Unity-like DX (developer experience)** inside the browser
3. A **fully open-source modular engine**
4. A system that AI coding agents can safely extend without architectural drift

---

# 🏗 Architecture Overview

Atmos is structured as a **monorepo with npm workspaces**.

```
/packages
  /math          # Vec3, Mat4, Quat, Ray, noise
  /core          # Component model, Scene, Engine, Input
  /renderer      # WebGPU, PBR, lights, shadows, post-fx
  /physics       # Rapier wrapper, rigid bodies, joints
  /animation     # Skeletal animation, clips, blending
  /assets        # glTF/GLB parser + instantiation
  /editor        # React-based Unity-style editor
  /terrain       # Voxel terrain, marching cubes, LOD
/examples
  /rotating-cube     # Minimal setup
  /pbr-scene         # 100 objects, PBR materials
  /falling-cubes     # Physics with Rapier
  /model-viewer      # glTF drag-and-drop
  /animated-model    # Skeletal animation
  /editor-demo       # Full editor
  /terrain-editor    # Voxel terrain + editor
```

Each package:

- Has strict TypeScript configuration
- Has zero circular dependencies
- Exposes a public API surface via `index.ts`
- Has its own test suite

---

# 📦 Packages

| Package                                 | Description                                                         | README                                 |
| --------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| [@atmos/math](packages/math/)           | Vec3, Mat4, Quat, Ray, noise — Float32Array, zero-alloc             | [README](packages/math/README.md)      |
| [@atmos/core](packages/core/)           | Component lifecycle, GameObject, Scene, Engine, Input, Time         | [README](packages/core/README.md)      |
| [@atmos/renderer](packages/renderer/)   | WebGPU PBR, 3 light types, CSM shadows, HDR post-fx, GPU skinning   | [README](packages/renderer/README.md)  |
| [@atmos/physics](packages/physics/)     | Rapier WASM wrapper, RigidBody, Collider, joints, queries           | [README](packages/physics/README.md)   |
| [@atmos/animation](packages/animation/) | Skeleton, AnimationClip, AnimationMixer, keyframe blending          | [README](packages/animation/README.md) |
| [@atmos/assets](packages/assets/)       | glTF 2.0 / GLB parser, mesh/material/skin/animation extraction      | [README](packages/assets/README.md)    |
| [@atmos/editor](packages/editor/)       | React editor: hierarchy, inspector, gizmos, picking, project I/O    | [README](packages/editor/README.md)    |
| [@atmos/terrain](packages/terrain/)     | Voxel density fields, marching cubes, LOD streaming, splat textures | [README](packages/terrain/README.md)   |

---

# 🎮 Examples

| Example                                    | Description                                | README                                      |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------- |
| [rotating-cube](examples/rotating-cube/)   | Minimal engine setup with a spinning cube  | [README](examples/rotating-cube/README.md)  |
| [pbr-scene](examples/pbr-scene/)           | 100 objects with PBR materials at 60fps    | [README](examples/pbr-scene/README.md)      |
| [falling-cubes](examples/falling-cubes/)   | Physics simulation with Rapier             | [README](examples/falling-cubes/README.md)  |
| [model-viewer](examples/model-viewer/)     | Drag-and-drop glTF/GLB viewer              | [README](examples/model-viewer/README.md)   |
| [animated-model](examples/animated-model/) | Skeletal animation with clip cross-fade    | [README](examples/animated-model/README.md) |
| [editor-demo](examples/editor-demo/)       | Full editor with all packages integrated   | [README](examples/editor-demo/README.md)    |
| [terrain-editor](examples/terrain-editor/) | Voxel terrain with splat textures + editor | [README](examples/terrain-editor/README.md) |

---

# 🔁 Engine Execution Model

Atmos uses a deterministic frame loop:

```
Awake Phase (once)
Start Phase (once)
--------------------------------
Frame Loop:
  Input Update
  Physics Step
  Script Update
  Render Phase
--------------------------------
Destroy Phase
```

---

# 🧩 Core Design Contracts

These contracts must NEVER be broken.

## 1. GameObject Contract

- Always has a Transform
- Has unique instance ID
- Components stored in insertion order
- No direct dependency on renderer

## 2. Component Contract

All components:

```ts
abstract class Component {
  gameObject: GameObject;
  enabled: boolean;

  onAwake?(): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onRender?(): void;
  onDestroy?(): void;
}
```

Rules:

- `onStart` must run once
- `onDestroy` must always free GPU/physics resources
- Disabled components skip update

---

# 🧠 Scene System

Scene:

- Root GameObject
- Registry of all objects
- Handles lifecycle propagation

Transform:

- Local matrix
- World matrix
- Dirty flag system
- Parent-child recalculation propagation

Matrix composition rule:

```
WorldMatrix = ParentWorld * LocalMatrix
LocalMatrix = T * R * S
```

---

# 🕒 Time System

`Time` singleton:

```ts
Time.deltaTime;
Time.time;
Time.frameCount;
```

Must:

- Use high-resolution timer
- Clamp large delta spikes
- Be deterministic during fixed physics steps

---

# 🎮 Input System

Supports:

- Keyboard
- Mouse
- Gamepad

Provides:

```ts
Input.getKey(key: string)
Input.getKeyDown(key: string)
Input.getAxis(name: string)
```

Must:

- Reset keyDown each frame
- Be frame-deterministic

---

# 🎨 Renderer Architecture

## Rendering Pipeline

```
Depth Pre-pass
Shadow Passes (2× CSM + Point Cube + Spot)
Main Pass (MSAA 4× → HDR resolve)
SSAO (half-res, 16 samples)
Bloom (5-level downsample/upsample)
Tonemap (ACES + gamma 2.2 + vignette) → Swapchain
```

## Lights

- **DirectionalLight** — cascaded shadow maps (2 cascades)
- **PointLight** — omnidirectional cube shadow maps
- **SpotLight** — perspective shadow maps

## Materials

PBR Cook-Torrance with:

- Albedo (color + texture)
- Metallic / Roughness (uniform + map)
- Normal maps (TBN from derivatives)
- Emissive (color + intensity)

---

# 🧱 Material System

Material:

- Shader module
- Uniform layout
- Texture bindings

Rules:

- Materials are immutable after creation
- GPU buffers are reused
- Bind groups cached per pipeline

---

# 🔥 Hot Reload System

When Vite updates a module:

1. Dispose old component instances
2. Preserve serialized state
3. Replace prototype
4. Re-run lifecycle safely

Must:

- Not reload entire scene
- Not reset physics world

---

# 📂 File Format

Scenes saved as JSON:

```json
{
  "gameObjects": [
    {
      "name": "Player",
      "components": [
        {
          "type": "PlayerController",
          "data": {
            "moveSpeed": 5
          }
        }
      ]
    }
  ]
}
```

---

# 🧪 Testing Strategy

Each package must include:

- Unit tests (Vitest)
- No DOM dependency in core
- Deterministic simulation tests

---

# 🧬 Coding Standards

- TypeScript strict mode required
- No `any`
- No circular dependencies
- Max file size: 400 lines
- Pure logic separated from side effects
- Use composition over inheritance

---

# ⚡ Performance Principles

- Avoid allocations inside `onUpdate`
- Reuse GPU buffers
- Dirty flag transform recalculation
- Minimize WebGPU state changes
- Batch draw calls

---

# 🤖 AI Agent Contribution Rules

When contributing:

1. Do not change public API without discussion
2. Do not introduce runtime reflection
3. Preserve deterministic execution
4. Keep packages isolated
5. Write tests for all core logic

Agents must:

- Extend via composition
- Avoid hidden side effects
- Follow lifecycle contract strictly

---

# 🚀 Example Usage

```ts
const scene = new Scene();

const cube = new GameObject("Cube");
cube.addComponent(Rotator);

scene.add(cube);
engine.start(scene);
```

---

# 📌 Future Roadmap

- ECS experimental mode
- Frame graph renderer
- WebXR support
- Multiplayer sync layer
- Visual shader editor
- Web-based asset marketplace

---

# 📜 License

GPL-3.0-or-later

---

Atmos is not just a web engine.
It is an experiment in how far the **open web + WebGPU + AI agents** can go.
