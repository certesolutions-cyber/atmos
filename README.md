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
  /core
  /renderer
  /math
  /physics
  /editor
/examples
```

Each package:

- Has strict TypeScript configuration
- Has zero circular dependencies
- Exposes a public API surface via `index.ts`
- Has its own test suite

---

# 📦 Packages

## 1️⃣ @atmos/core

Responsible for:

- Game loop
- Scene graph
- Component model
- Lifecycle management
- Input system
- Time management

### Responsibilities

- Deterministic update cycle
- Component registration system
- Object hierarchy management
- Lifecycle state tracking

### Non-responsibilities

- Rendering implementation
- Physics engine internals
- Editor UI

---

## 2️⃣ @atmos/renderer

Responsible for:

- WebGPU device initialization
- Render pipeline management
- Materials
- Mesh rendering
- Bind group optimization
- Frame graph (future)

---

## 3️⃣ @atmos/math

Responsible for:

- Vector & matrix math
- Transform calculations
- GPU-compatible memory layouts

Must:

- Use `Float32Array`
- Avoid heap allocations in hot paths
- Be tree-shakable

---

## 4️⃣ @atmos/physics

Wrapper around Rapier (WASM).

Responsible for:

- Physics world lifecycle
- Syncing physics transforms to GameObjects
- Collision event system

---

## 5️⃣ @atmos/editor (Client)

React-based editor running on Vite dev server.

Responsible for:

- Scene hierarchy view
- Inspector
- Asset browser
- Project file management
- Hot reload bridge

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

## Initialization

1. Request adapter
2. Request device
3. Configure canvas context
4. Setup depth buffer
5. Create default pipeline

## Rendering Flow

Per frame:

```
Begin Command Encoder
  Begin Render Pass
    Draw opaque objects
    Draw transparent objects
  End Pass
Submit queue
```

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

# 📋 Development Phases

## Phase 1 – Core Minimal Engine

Deliver:

- Game loop
- Transform hierarchy
- Component system
- Basic WebGPU clear screen

Exit Criteria:

- Rotating cube example runs

---

## Phase 2 – Rendering Expansion

Deliver:

- Mesh support
- PBR material
- Depth testing
- Multiple objects

Exit Criteria:

- Scene with 100 objects renders at 60fps

---

## Phase 3 – Physics Integration

Deliver:

- Rapier wrapper
- RigidBody component
- Collider component
- Sync transforms

Exit Criteria:

- Falling cube with collision

---

## Phase 4 – Editor MVP

Deliver:

- Scene hierarchy panel
- Inspector
- Editable decorator support
- Save/load scenes

Exit Criteria:

- Modify property in editor updates scene live

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

MIT

---

Atmos is not just a web engine.  
It is an experiment in how far the **open web + WebGPU + AI agents** can go.
