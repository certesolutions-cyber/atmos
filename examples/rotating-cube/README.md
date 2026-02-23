# 🎲 Rotating Cube

The simplest Atmos Engine example — a single PBR-lit cube spinning in place. Use this as a starting template for new projects.

---

## ▶️ How to Run

```bash
cd examples/rotating-cube
npx vite
```

Open `http://localhost:5173` in a WebGPU-capable browser (Chrome 113+).

---

## 🔑 What It Shows

- **Minimal engine setup** — `initWebGPU` → Scene → Camera → Light → RenderSystem → Engine
- **Custom component** — A `Rotator` class that spins the cube each frame
- **PBR material** — Albedo, metallic, and roughness on a cube mesh
- **Component lifecycle** — `onUpdate(dt)` called every frame

---

## 💡 Key Code

```ts
class Rotator extends Component {
  onUpdate(dt: number) {
    const r = this.gameObject.transform.rotation;
    Quat.rotateY(r, r, dt);
    this.gameObject.transform.rotation = r;
  }
}

const cube = new GameObject('Cube');
cube.addComponent(Rotator);

const mr = cube.addComponent(MeshRenderer);
mr.init({ mesh, material, device, pipelineResources });

scene.add(cube);
engine.start(scene);
```

---

## 📁 Files

```
examples/rotating-cube/
  index.html      # Canvas element
  src/main.ts     # ~50 lines — complete setup
```
