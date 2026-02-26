# @certe/atmos-editor

Unity-style editor for the Atmos Engine, built with React. Provides scene hierarchy, inspector, gizmos, object picking, orbit camera, project file I/O, and material asset management — all running in the browser.

---

## Getting Started

```bash
mkdir my-game && cd my-game
npm install @certe/atmos-editor
npx atmos-init
npm run dev
```

That's it. `atmos-init` creates `vite.config.ts`, `src/main.ts`, `tsconfig.json`, installs dev dependencies, and adds npm scripts. The editor opens at `http://localhost:5173`.

### Manual setup

If you prefer to set things up yourself:

1. Install dependencies:
   ```bash
   npm install @certe/atmos-editor
   npm install -D vite @vitejs/plugin-react typescript
   ```

2. Create `vite.config.ts`:
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { atmosPlugin } from '@certe/atmos-editor/vite';

   export default defineConfig({
     plugins: [react(), atmosPlugin()],
   });
   ```

3. Create `src/main.ts`:
   ```ts
   import { startEditor, createEditorPhysics } from '@certe/atmos-editor';

   await startEditor({
     physics: await createEditorPhysics(),
     scriptModules: import.meta.glob('./scripts/*.ts', { eager: true }),
   });
   ```

4. Run: `npx vite`

The editor opens with a WebGPU viewport, scene hierarchy, inspector, and gizmo tools. Place game scripts in `src/scripts/` and they'll be automatically discovered.

### 6. Build a standalone game

```bash
npx vite build
```

This produces a `dist/` folder with a player-only build — no editor UI, no React. The build entry is generated automatically by `atmosPlugin`.

To preview the build:

```bash
npx vite preview
```

---

## Project Structure

A typical Atmos project looks like this:

```
my-game/
  src/
    main.ts               # Editor entry point
    scripts/              # Game scripts (auto-discovered)
      player-controller.ts
      enemy-ai.ts
  scenes/
    main.scene.json       # Saved from editor
  materials/
    metal.mat.json        # Material assets
  textures/
    diffuse.jpg
  project-settings.json   # Editor settings (defaultScene, physics)
  vite.config.ts
  package.json
```

---

## Custom HTML

You can provide your own `index.html` with a game UI overlay:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #atmos-container { position: relative; width: 100%; height: 100%; }
    #atmos-canvas { width: 100%; height: 100%; display: block; }
    #atmos-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    #atmos-ui * { pointer-events: auto; }
  </style>
</head>
<body>
  <div id="atmos-container">
    <canvas id="atmos-canvas"></canvas>
    <div id="atmos-ui">
      <!-- Your game UI here (health bar, minimap, etc.) -->
    </div>
  </div>
</body>
</html>
```

The `#atmos-ui` overlay renders on top of the canvas in both editor and build modes. If no `index.html` is provided, one is generated automatically.

---

## EditorState

Central state machine with event-driven updates:

```ts
editorState.select(gameObject);           // emits 'selectionChanged'
editorState.setGizmoMode('rotate');       // emits 'gizmoModeChanged'
editorState.togglePause();                // emits 'pauseChanged'
editorState.setScene(newScene);           // emits 'sceneChanged'

editorState.on('selectionChanged', () => { /* update UI */ });
```

Events: `selectionChanged` · `sceneChanged` · `pauseChanged` · `gizmoModeChanged` · `snapChanged` · `inspectorChanged` · `sceneRestored` · `assetsChanged` · `projectChanged` · `materialSelected` · `wireframeChanged`

---

## UI Panels

| Panel | Description |
|---|---|
| **Hierarchy** | Tree view with drag-and-drop reparenting, search/filter, context menu (create primitives, lights, duplicate, delete) |
| **Inspector** | Transform fields, component list with enable/disable/remove, add component button, dynamic property fields |
| **Asset Browser** | File tree from project directory, double-click to load models |
| **Post-Process** | Exposure, SSAO, Bloom, Vignette controls |
| **Material Inspector** | Edit material properties when a `.mat.json` is selected |

---

## Editor Controls

- **Left click** — select object
- **Drag** — orbit camera
- **Shift+Drag** — pan camera
- **Scroll** — zoom
- **W** — translate gizmo
- **E** — rotate gizmo
- **R** — scale gizmo
- Camera presets: Front, Back, Left, Right, Top, Bottom

---

## Vite Plugin Options

```ts
atmosPlugin({
  include: ['src'],        // Directories to scan for asset browser
  exclude: ['temp'],       // Directories to exclude
  entry: 'src/main.ts',   // Entry file (default)
})
```

---

## startEditor() Options

| Option | Description |
|---|---|
| `canvas` / `container` | Custom DOM elements |
| `physics` | Physics plugin (Rapier integration) |
| `setupScene` | Callback for custom scene initialization |
| `primitiveFactory` | Custom primitive creation logic |
| `componentFactory` | Custom component creation logic |
| `deserializeContext` | Custom deserialization hooks |
| `showAssetBrowser` | Toggle asset browser panel |
| `scriptModules` | `import.meta.glob()` result for script discovery |

---

## Dependencies

- `@certe/atmos-core` — Component, GameObject, Scene, serialization
- `@certe/atmos-renderer` — RenderSystem, Camera, Material, lights, pipelines
- `@certe/atmos-math` — Vec3, Mat4, Quat, Ray
- `@certe/atmos-assets` — glTF model loading
- `@certe/atmos-animation` — AnimationMixer registration
- `react` / `react-dom` — Editor UI (not included in game builds)
