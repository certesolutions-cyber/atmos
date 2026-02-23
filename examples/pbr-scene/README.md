# 🌐 PBR Scene

Renders a 10×10 grid of 100 objects with shared geometry and PBR materials. Demonstrates rendering performance, mesh pooling, and material reuse.

---

## ▶️ How to Run

```bash
cd examples/pbr-scene
npx vite
```

Open `http://localhost:5173` in a WebGPU-capable browser.

---

## 🔑 What It Shows

- **100 objects at 60fps** — performance target for the renderer
- **4 geometry types** — cube, sphere, cylinder, plane alternating in the grid
- **5 PBR materials** — shared across objects (albedo, metallic, roughness variations)
- **Mesh pooling** — 4 GPU meshes reused by 100 MeshRenderers
- **FPS counter** — real-time frame rate monitoring

---

## 💡 Key Code

```ts
// Pool geometries and materials
const meshes = [cube, sphere, cylinder, plane].map(g => createMesh(device, g));
const materials = colors.map(c => createMaterial(device, pipeline, {
  albedo: c, metallic: 0.5, roughness: 0.3,
}));

// 10x10 grid
for (let x = 0; x < 10; x++) {
  for (let z = 0; z < 10; z++) {
    const obj = new GameObject(`Obj_${x}_${z}`);
    obj.transform.setPosition(x * 2 - 9, 0, z * 2 - 9);
    const mr = obj.addComponent(MeshRenderer);
    mr.init({ mesh: meshes[i % 4], material: materials[i % 5], device, pipelineResources });
    obj.addComponent(RandomRotator);
    scene.add(obj);
  }
}
```

---

## 📁 Files

```
examples/pbr-scene/
  index.html      # Canvas + FPS overlay
  src/main.ts     # ~107 lines
```
