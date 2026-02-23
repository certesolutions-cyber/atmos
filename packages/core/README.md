# 🧩 @atmos/core

The heart of the Atmos Engine — game loop, scene graph, component model, input, and serialization. This package has no rendering or physics code; it defines the contracts that all other packages build on.

---

## 🔑 Key Concepts

### Component Lifecycle

Every component follows a strict lifecycle:

```
onAwake()  →  onStart()  →  onUpdate(dt)  →  onRender()  →  onDestroy()
   once          once        every frame      every frame      once
```

```ts
import { Component } from '@atmos/core';

class Rotator extends Component {
  speed = 1;

  onUpdate(dt: number) {
    const r = this.gameObject.transform.rotation;
    Quat.rotateY(r, r, this.speed * dt);
    this.gameObject.transform.rotation = r; // triggers dirty flag
  }
}
```

### GameObject & Transform

Every `GameObject` has a unique ID and always carries a `Transform`:

```ts
const cube = new GameObject('Cube');
cube.transform.setPosition(0, 5, 0);
cube.transform.setScale(2, 2, 2);

const child = new GameObject('Child');
child.setParent(cube); // inherits parent's world matrix
```

Transform uses a **dirty flag system** — local matrix recomputes only when TRS changes, and world matrix propagates through the parent chain.

---

## 🚀 Quick Start

```ts
import { Engine, Scene, GameObject, Time, Input } from '@atmos/core';

const scene = new Scene();
const player = new GameObject('Player');
player.addComponent(MyController);
scene.add(player);

const engine = new Engine();
engine.start(scene);
```

---

## 📖 API Overview

### Engine

The main loop orchestrator. Frame order:

```
Input.endFrame() → Physics.step() → Scene.updateAll(dt) → Render
```

| Method / Property | Description |
|---|---|
| `start(scene)` | Begin the game loop |
| `stop()` | Stop the loop |
| `paused` | Get/set — skips physics & scripts when true |
| `scene` | Set to swap scenes at runtime |
| `setRenderer(r)` | Provide a renderer implementation |
| `setPhysics(p)` | Provide a physics stepper |

### Scene

Container for GameObjects. Manages lifecycle propagation.

| Method | Description |
|---|---|
| `add(obj)` | Add a GameObject (and children) |
| `remove(obj)` | Remove and call onDestroy on all components |
| `getAllObjects()` | `ReadonlySet<GameObject>` |
| `findAll<T>(Ctor)` | Find all components of a type |
| `awakeAll()` / `startAll()` / `updateAll(dt)` / `renderAll()` | Lifecycle phases |

### Input

Keyboard and mouse state, frame-deterministic:

```ts
if (Input.getKeyDown('Space')) jump();
if (Input.getKey('KeyW')) moveForward(dt);
const { x, y } = input.mousePosition;
```

### Time

```ts
Time.deltaTime   // seconds since last frame (clamped to 100ms)
Time.time        // accumulated seconds
Time.frameCount  // integer frame counter
```

### Component Registry

Register components at startup so the editor and serializer know about them:

```ts
import { registerComponent } from '@atmos/core';

registerComponent(Rotator, {
  name: 'Rotator',
  properties: [
    { key: 'speed', type: 'number', default: 1, min: 0, max: 10 },
  ],
});
```

### Scene Serialization

```ts
import { serializeScene, deserializeScene } from '@atmos/core';

const data = serializeScene(scene);           // → JSON-safe SceneData
const restored = deserializeScene(data, ctx); // → new Scene
```

The serializer handles Transform, parent-child relationships, component data, and `gameObjectRef` resolution across a 3-pass process.

---

## 🧠 Design Principles

- **No circular dependencies** — Component ↔ Scene link uses late binding
- **Deterministic execution** — fixed update order, frame-deterministic input
- **Composition over inheritance** — components attached to GameObjects
- **Strict TypeScript** — no `any`, all public APIs typed

---

## 📁 Structure

```
packages/core/src/
  index.ts              # Public API
  component.ts          # Abstract Component base class
  game-object.ts        # GameObject with Transform
  transform.ts          # TRS + dirty flags + hierarchy
  scene.ts              # Scene graph + lifecycle
  engine.ts             # Main loop
  input.ts              # Keyboard/mouse
  time.ts               # Frame timing
  component-registry.ts # Property metadata
  scene-serializer.ts   # Save/load scenes
```

---

## 🔗 Dependencies

- `@atmos/math` — Vec3, Mat4, Quat for Transform
