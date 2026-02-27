# ⚡ @certe/atmos-physics

Physics integration for the Atmos Engine, wrapping [Rapier](https://rapier.rs/) (WASM). Provides rigid bodies, collider shapes, joints, and stateless physics queries — all as components that sync automatically with the engine's Transform system.

---

## 🚀 Quick Start

```ts
import { initRapier, PhysicsWorld, PhysicsSystem,
         RigidBody, Collider } from '@certe/atmos-physics';

await initRapier();
const world = new PhysicsWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
const physicsSystem = new PhysicsSystem(world, scene); // sets Physics.current
engine.setPhysics(physicsSystem);

// Dynamic cube — auto-initializes on next physics step
const cube = new GameObject('Cube');
scene.add(cube);
const rb = cube.addComponent(RigidBody);
rb.bodyType = 'dynamic';
const col = cube.addComponent(Collider);
col.shape = { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
```

---

## 📖 API Overview

### Initialization

| Function | Description |
|---|---|
| `initRapier()` | Load Rapier WASM (idempotent, call once at startup) |
| `new PhysicsWorld(opts?)` | Create simulation with gravity, timestep, solver iterations |

### RigidBody Component

| Property | Description |
|---|---|
| `type` | `'dynamic'` · `'fixed'` · `'kinematic'` |
| `mass` | Mass for dynamic bodies |
| `linearDamping` / `angularDamping` | Velocity damping |
| `gravityScale` | Per-body gravity multiplier |

```ts
rb.addForce(0, 100, 0);    // continuous force
rb.addImpulse(0, 10, 0);   // instant impulse
```

### Collider Component

Supported shapes:

| Shape | Parameters |
|---|---|
| `box` | `halfExtents: {x, y, z}` |
| `sphere` | `radius` |
| `capsule` | `halfHeight, radius` |
| `cylinder` | `halfHeight, radius` |
| `convexHull` | `vertices: Float32Array` |

```ts
const col = obj.addComponent(Collider);
col.shape = { type: 'sphere', radius: 1.0 };
col.friction = 0.5;
col.restitution = 0.3;
col.isSensor = false;  // true = trigger volume
// Auto-initializes on next physics step
```

Colliders auto-attach to the nearest ancestor `RigidBody` and compute offsets for child GameObjects.

### Joints

| Joint Type | Description |
|---|---|
| `FixedJoint` | Rigid constraint (no relative motion) |
| `HingeJoint` | Revolute (rotation around one axis), with optional limits and motor |
| `SpringJoint` | Spring with rest length, stiffness, and damping |

```ts
const hinge = obj.addComponent(HingeJoint);
hinge.init(world, {
  connectedObject: otherObj,
  axis: { x: 0, y: 1, z: 0 },
  limitsEnabled: true,
  limitMin: -Math.PI / 4,
  limitMax: Math.PI / 4,
});
```

### Physics Queries

Raycasting and shape-casting via the `Physics` class. Uses `Physics.current` automatically (set by `PhysicsSystem`):

```ts
import { Physics } from '@certe/atmos-physics';

const hit = Physics.raycast(origin, direction, 100);
if (hit) {
  console.log(hit.gameObject.name, hit.point, hit.normal, hit.distance);
}

const hits = Physics.sphereCastAll(center, radius);
const boxHit = Physics.boxCast(center, halfExtents);
```

### PhysicsSystem

Runs each frame via the engine. Handles:

- **Auto-init**: Uninitialised RigidBody/Collider components are initialised automatically (deferred init)
- **Pre-step**: Detects external transform changes → teleports dynamic bodies; syncs kinematic bodies
- **Step**: Fixed-timestep accumulator (`world.step(dt)`)
- **Post-step**: Copies Rapier transforms back to engine Transforms
- Sets `Physics.current` on construction

---

## 📁 Structure

```
packages/physics/src/
  index.ts           # Public API
  rapier-init.ts     # WASM loader
  physics-world.ts   # Rapier world wrapper
  physics-system.ts  # Per-frame sync orchestrator
  rigid-body.ts      # RigidBody component
  collider.ts        # Collider component + shapes
  joint.ts           # Abstract Joint base
  fixed-joint.ts     # FixedJoint
  hinge-joint.ts     # HingeJoint (limits, motor)
  spring-joint.ts    # SpringJoint
  physics-query.ts   # Raycast, sphere/box cast
  helpers.ts         # Ancestor traversal utilities
```

---

## 🔗 Dependencies

- `@certe/atmos-core` — Component, GameObject, Transform, Scene
- `@certe/atmos-math` — Vec3, Quat for transform sync
- `@dimforge/rapier3d-compat` — WASM physics engine
