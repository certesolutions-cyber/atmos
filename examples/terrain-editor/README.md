# 🏔️ Terrain Editor

Procedural voxel terrain with chunked streaming, multi-layer splat texturing, and the full editor UI. Demonstrates `TerrainWorld` with noise-based density, LOD levels, and brush editing.

---

## ▶️ How to Run

```bash
cd examples/terrain-editor
npx vite
```

Open `http://localhost:5173` in Chrome.

---

## 🔑 What It Shows

- **Procedural terrain** — density function from 3D Perlin noise
- **Chunked streaming** — `TerrainWorld` loads/unloads chunks around the camera
- **3-level LOD** — full detail near camera, reduced at distance
- **Splat texturing** — grass/rock/snow blend based on surface slope and height
- **Procedural textures** — generated at runtime (no texture files needed)
- **Brush editing** — sphere/cube brushes modify terrain density in real-time
- **Editor integration** — full editor UI with hierarchy, inspector, gizmos

---

## 💡 Key Code

```ts
import { TerrainWorld, noiseTerrain, registerTerrainBuiltins } from '@certe/atmos-terrain';

registerTerrainBuiltins();

// Density function defines the terrain shape
const density = noiseTerrain(perlinNoise3D, 32, 0);

// Setup scene callback for startEditor
function setupScene(ctx) {
  const terrainObj = new GameObject('Terrain');
  const world = terrainObj.addComponent(TerrainWorld);
  world.setDensityFn(density);
  world.init(ctx.device, ctx.pipelineResources, ctx.scene);
  world.cameraTarget = ctx.camera.gameObject;

  // Splat: grass on flat, rock on slopes, snow at height
  world.setSplatMaterials(terrainPipeline, [grassTex, rockTex, snowTex],
    (nx, ny, nz, y) => {
      const slope = 1 - ny;
      const snow = y > 20 ? 1 : 0;
      return [1 - slope - snow, slope];
    }
  );

  ctx.scene.add(terrainObj);
}

await startEditor({ setupScene });
```

---

## 📁 Files

```
examples/terrain-editor/
  index.html               # Minimal HTML shell
  src/main.ts              # ~123 lines
  src/terrain-density.ts   # Custom density function
```
