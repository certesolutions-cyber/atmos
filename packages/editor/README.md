# 🛠️ @atmos/editor

Unity-style editor for the Atmos Engine, built with React. Provides scene hierarchy, inspector, gizmos, object picking, orbit camera, project file I/O, and material asset management — all running in the browser.

---

## 🚀 Quick Start

```ts
import { startEditor } from '@atmos/editor';

const app = await startEditor();
// Editor is now running with WebGPU viewport, React UI, and all tools
```

With physics:

```ts
import { startEditor } from '@atmos/editor';
import { createEditorPhysics } from './physics-plugin';

const app = await startEditor({
  physics: await createEditorPhysics(),
});
```

---

## 🔑 Key Systems

### EditorState

Central state machine with event-driven updates:

```ts
editorState.select(gameObject);            // emits 'selectionChanged'
editorState.setGizmoMode('rotate');        // emits 'gizmoModeChanged'
editorState.togglePause();                 // emits 'pauseChanged'
editorState.setScene(newScene);            // emits 'sceneChanged'

editorState.on('selectionChanged', () => { /* update UI */ });
```

Events: `selectionChanged` · `sceneChanged` · `pauseChanged` · `gizmoModeChanged` · `snapChanged` · `inspectorChanged` · `sceneRestored` · `assetsChanged` · `projectChanged` · `materialSelected` · `wireframeChanged`

### Object Picking

Ray-triangle picking from screen coordinates:

1. Build ray from screen coords via `Ray.fromScreenCoords()`
2. Bounding sphere early-out for each MeshRenderer
3. Triangle-level Möller-Trumbore test on CPU vertex data
4. Return closest hit

### Gizmos

Translate / Rotate / Scale gizmo with:
- Axis hit-test (ray-to-line distance) for translate & scale
- Ring intersection (plane test + radius check) for rotation
- Constant screen-size scaling
- Snap-to-grid support

### Orbit Camera

Mouse-based camera navigation:
- **Drag** — orbit (azimuth + elevation)
- **Shift+Drag** — pan
- **Wheel** — zoom
- Camera presets: Front, Back, Left, Right, Top, Bottom

### ProjectFileSystem

File System Access API wrapper with Vite dev server fallback:

```ts
await projectFs.open();                          // showDirectoryPicker()
const data = await projectFs.readFile('scenes/main.scene.json');
await projectFs.writeFile('scenes/main.scene.json', jsonString);
const files = await projectFs.listFiles('materials/');
```

Handles are persisted in IndexedDB for automatic reconnection.

### MaterialManager

CRUD for `.mat.json` material assets with GPU caching:

```ts
const path = await materialManager.createMaterial('Steel', 'pbr');
const material = await materialManager.getMaterial(path);
await materialManager.updateMaterial(path, { metallic: 0.9, roughness: 0.1 });
```

---

## 🖥️ UI Panels

| Panel | Description |
|---|---|
| **Hierarchy** | Tree view with DnD reparenting, search/filter, context menu (create primitives, lights, duplicate, delete) |
| **Inspector** | Transform fields, component list with enable/disable/remove, add component button, dynamic property fields |
| **Asset Browser** | File tree from project directory, double-click to load models |
| **Post-Process** | Exposure, SSAO, Bloom, Vignette controls |
| **Material Inspector** | Edit material properties when a `.mat.json` is selected |

---

## ⚙️ Configuration

`startEditor()` accepts an `EditorConfig` for customization:

| Option | Description |
|---|---|
| `canvas` / `container` | Custom DOM elements |
| `physics` | Physics plugin (Rapier integration) |
| `setupScene` | Callback for custom scene initialization |
| `primitiveFactory` | Custom primitive creation logic |
| `componentFactory` | Custom component creation logic |
| `deserializeContext` | Custom deserialization hooks |
| `showAssetBrowser` | Toggle asset browser panel |

---

## 📁 Structure

```
packages/editor/src/
  index.ts                  # Public API
  editor-state.ts           # Central state + events
  editor-mount.ts           # React mount + mouse handlers
  bootstrap/
    start-editor.ts         # Main initialization
    default-factories.ts    # Primitive/component/deserialize factories
  object-picker.ts          # Ray-triangle picking
  gizmo-state.ts            # Hit-test + drag math
  gizmo-renderer.ts         # Unlit gizmo drawing
  gizmo-meshes.ts           # Arrow/ring/cube mesh data
  overlay-renderer.ts       # Grid + gizmo orchestration
  orbit-camera.ts           # Mouse orbit/pan/zoom
  project-fs.ts             # File System Access API
  material-manager.ts       # Material CRUD + GPU cache
  scene-operations.ts       # find/duplicate/delete/reparent
  scene-snapshot.ts         # Play-mode save/restore
  components/               # React UI panels
```

---

## 🔗 Dependencies

- `@atmos/core` — Component, GameObject, Scene, serialization
- `@atmos/renderer` — RenderSystem, Camera, Material, lights, pipelines
- `@atmos/math` — Vec3, Mat4, Quat, Ray
- `@atmos/assets` — glTF model loading
- `@atmos/animation` — AnimationMixer registration
- `react` / `react-dom` — Editor UI
