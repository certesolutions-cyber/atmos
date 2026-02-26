# 🗿 Model Viewer

Drag-and-drop glTF/GLB model viewer with orbit camera. Demonstrates the two-stage asset pipeline: `parseGltfModel()` → `instantiateModel()`.

---

## ▶️ How to Run

```bash
cd examples/model-viewer
npx vite
```

Open `http://localhost:5173`, then drag a `.glb` file onto the viewport (or it auto-loads `models/model.glb` if present).

---

## 🔑 What It Shows

- **glTF loading** — `parseGltfModel(buffer)` for CPU parsing, `instantiateModel(asset, { renderSystem })` for GPU upload
- **Drag-and-drop** — File input + drop zone with visual feedback
- **Orbit camera** — mouse drag (orbit), wheel (zoom), spherical coordinates
- **Model info** — displays mesh count after loading

---

## 💡 Key Code

```ts
import { parseGltfModel, instantiateModel } from '@certe/atmos-assets';

async function loadModel(buffer: ArrayBuffer, name: string) {
  const asset = parseGltfModel(buffer, name);
  const root = await instantiateModel(asset, { renderSystem });
  scene.add(root);
}

// Drag-and-drop handler
canvas.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer!.files[0];
  const buffer = await file.arrayBuffer();
  await loadModel(buffer, file.name);
});
```

---

## 📁 Files

```
examples/model-viewer/
  index.html      # Canvas + drop zone + file input
  src/main.ts     # ~125 lines
  models/         # Optional .glb files
```
