# 🧊 Falling Cubes

Physics demo using Rapier WASM. Dynamic cubes fall under gravity, bounce off a static floor, and collide with each other.

---

## ▶️ How to Run

```bash
cd examples/falling-cubes
npx vite
```

Open `http://localhost:5173` in a WebGPU-capable browser.

---

## 🔑 What It Shows

- **Rapier integration** — `initRapier()` + `PhysicsWorld` + `PhysicsSystem`
- **Rigid body types** — dynamic cubes (fall + collide) vs. fixed floor (immovable)
- **Colliders** — box shape with restitution for bouncing
- **Transform sync** — physics engine ↔ engine transforms synced each frame
- **Parallel init** — `Promise.all([initWebGPU(), initRapier()])` for faster startup

---

## 💡 Key Code

```ts
// Parallel GPU + physics init
const [gpu, RAPIER] = await Promise.all([initWebGPU(canvas), initRapier()]);
const world = new PhysicsWorld({ gravity: { x: 0, y: -9.81, z: 0 } });

// Static floor
const floor = new GameObject('Floor');
const floorRb = floor.addComponent(RigidBody);
floorRb.init(world, { type: 'fixed' });
const floorCol = floor.addComponent(Collider);
floorCol.init(world, { shape: { type: 'box', halfExtents: { x: 50, y: 0.5, z: 50 } } });

// Dynamic cubes
for (let i = 0; i < 10; i++) {
  const cube = new GameObject(`Cube_${i}`);
  cube.transform.setPosition(i * 1.5 - 7, 5 + i * 2, 0);
  const rb = cube.addComponent(RigidBody);
  rb.init(world, { type: 'dynamic' });
  const col = cube.addComponent(Collider);
  col.init(world, { shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }, restitution: 0.3 });
}

// Wire physics into engine
const physicsSystem = new PhysicsSystem(world, scene);
engine.setPhysics(physicsSystem);
```

---

## 📁 Files

```
examples/falling-cubes/
  index.html      # Canvas element
  src/main.ts     # ~128 lines
```
