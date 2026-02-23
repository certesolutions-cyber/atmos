# 🖥️ Editor Demo

The full Atmos Editor — a Unity-style editing environment running entirely in the browser. Integrates all engine packages: rendering, physics, animation, assets, and terrain.

---

## ▶️ How to Run

```bash
cd examples/editor-demo
npx vite
```

Open `http://localhost:5173` in Chrome (requires File System Access API for project persistence).

---

## 🔑 What It Shows

- **One-line setup** — `startEditor({ physics })` initializes everything
- **Scene hierarchy** — tree view with drag-and-drop reparenting, search, context menu
- **Inspector** — transform fields, component properties, add/remove components
- **Gizmos** — translate / rotate / scale with axis handles and snap-to-grid
- **Object picking** — click to select, ray-triangle intersection
- **Scene persistence** — save/load `.scene.json` via File System Access API
- **Material assets** — `.mat.json` files with live preview in the material inspector
- **Model import** — drag `.glb` files into the asset browser
- **Post-processing** — exposure, bloom, SSAO, vignette controls
- **Play mode** — toggle between edit and play with scene snapshot restore

---

## 💡 Key Code

```ts
import { startEditor } from '@atmos/editor';

// That's it — the editor handles everything
const app = await startEditor({
  physics: await createEditorPhysics(),
});

// Access subsystems if needed
app.editorState.on('selectionChanged', () => { /* ... */ });
app.renderSystem.bloomIntensity = 0.1;
```

---

## 📁 Files

```
examples/editor-demo/
  index.html                    # Minimal HTML shell
  src/main.ts                   # ~3 lines — delegates to startEditor()
  scenes/main.scene.json        # Default scene
  materials/*.mat.json          # Material assets
  textures/*.png                # Texture assets
  models/*.glb                  # 3D model assets
```
