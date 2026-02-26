# 🏔️ @certe/atmos-terrain

Voxel-based terrain system for the Atmos Engine. Provides density field primitives, marching cubes surface extraction, multi-level LOD streaming, and optional splat texturing with 3-layer blending.

---

## 🔑 Key Concepts

- **Density Field** — A function `(x, y, z) → number` where negative = solid, positive = air, surface at `isoLevel`
- **Marching Cubes** — Polygonizes the density field into triangle meshes per chunk
- **LOD Streaming** — `TerrainWorld` streams chunks around a camera with 3 LOD levels
- **Splat Texturing** — Blend 3 terrain textures based on surface normal and height

---

## 🚀 Quick Start

```ts
import { TerrainWorld, noiseTerrain, registerTerrainBuiltins } from '@certe/atmos-terrain';
import { perlinNoise3D } from '@certe/atmos-math';

registerTerrainBuiltins();

const terrain = gameObject.addComponent(TerrainWorld);
terrain.setDensityFn(noiseTerrain(perlinNoise3D, 32, 0));
terrain.init(device, pipelineResources, scene);
terrain.cameraTarget = cameraGameObject;
```

---

## 📖 API Overview

### Density Primitives

Build terrain shapes with CSG composition:

```ts
import { sphereDensity, planeDensity, boxDensity,
         unionDensity, subtractDensity, noiseTerrain } from '@certe/atmos-terrain';

const ground = planeDensity(0);
const hill = sphereDensity(10, 0, 10, 8);
const cave = sphereDensity(10, -2, 10, 4);

const density = subtractDensity(unionDensity(ground, hill), cave);
```

| Function | Description |
|---|---|
| `sphereDensity(cx, cy, cz, r)` | SDF sphere |
| `planeDensity(height)` | Half-space below Y |
| `boxDensity(cx, cy, cz, hx, hy, hz)` | SDF box |
| `unionDensity(a, b)` | CSG union |
| `intersectDensity(a, b)` | CSG intersection |
| `subtractDensity(a, b)` | CSG subtraction |
| `noiseTerrain(noiseFn, amp, baseY)` | Noise-based heightmap |

### TerrainWorld (Infinite Streaming)

Streams chunks around a focus point with 3 LOD levels:

| Property | Description |
|---|---|
| `loadRadius` / `unloadRadius` | Chunk-distance thresholds |
| `maxBuildsPerFrame` / `buildBudgetMs` | Amortized build limits |
| `cameraTarget` | GameObject to track for streaming |
| `config` | `TerrainConfig` (chunkSize, voxelSize, smoothNormals) |
| `lodConfig` | `LODConfig` with distance thresholds |

| Method | Description |
|---|---|
| `setDensityFn(fn)` | Set the terrain density function |
| `init(device, pipeline, scene)` | Initialize GPU context |
| `setSplatMaterials(pipeline, textures, weightFn)` | Enable 3-layer splat blending |
| `edit(op)` | Apply brush edit (sphere/cube) |

LOD levels: **LOD 0** (step=1, near) → **LOD 1** (step=2, medium) → **LOD 2** (step=4, far)

### TerrainVolume (Bounded Grid)

Fixed N×M×P chunk grid for smaller terrains:

```ts
const volume = gameObject.addComponent(TerrainVolume);
volume.chunksX = 4; volume.chunksY = 2; volume.chunksZ = 4;
volume.setDensityFn(myDensity);
volume.init(device, pipelineResources, scene);
volume.build();
```

### Brush Editing

```ts
terrain.edit({
  shape: 'sphere',
  x: hitPoint[0], y: hitPoint[1], z: hitPoint[2],
  radius: 3,
  strength: -0.5,  // negative = add, positive = remove
  falloff: 1,
});
```

### Splat Texturing

Blend 3 textures based on surface normal and world height:

```ts
terrain.setSplatMaterials(terrainPipeline, [grassTex, rockTex, snowTex],
  (nx, ny, nz, worldY) => {
    const slope = 1 - ny;
    const snow = worldY > 20 ? 1 : 0;
    return [1 - slope - snow, slope]; // [grass, rock], snow = remainder
  }
);
```

---

## 🧠 Implementation Details

- **Vertex format**: 8 floats (pos+normal+uv) standard, 10 floats (+ weights) for splat
- **Skirt geometry**: Chunks extend 1 voxel past boundaries to hide LOD seams
- **Pooled buffers**: Scratch vertex/index/density arrays reused across builds
- **Deferred removal**: Old chunks kept 1 frame for smooth transitions
- **Chunk keys**: 30-bit packed coordinates (10 bits per axis)

---

## 📁 Structure

```
packages/terrain/src/
  index.ts              # Public API
  types.ts              # TerrainConfig, DensityFn, ChunkCoord, etc.
  density-field.ts      # Density primitives + CSG
  marching-cubes.ts     # Full-resolution surface extraction
  lod-extract.ts        # LOD-stepped marching cubes
  terrain-normals.ts    # Gradient + triangle normal computation
  chunk.ts              # TerrainChunk (density grid + mesh)
  chunk-key.ts          # Coordinate packing utilities
  lod-chunk.ts          # buildLODMesh / buildLODSplatMesh
  terrain-world.ts      # TerrainWorld streaming component
  terrain-volume.ts     # TerrainVolume bounded grid component
  terrain-editor.ts     # Brush edit system
  register-builtins.ts  # Component registry integration
```

---

## 🔗 Dependencies

- `@certe/atmos-core` — Component, GameObject, Scene
- `@certe/atmos-math` — Noise functions for terrain generation
- `@certe/atmos-renderer` — Mesh, Material, terrain pipeline, textures
