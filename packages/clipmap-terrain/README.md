# @certe/atmos-clipmap-terrain

GPU-driven geometry clipmap terrain for the Atmos Engine. Renders large-scale heightmap terrain with automatic level-of-detail using concentric grid rings around the camera.

## How It Works

A **geometry clipmap** surrounds the camera with concentric square grid rings. Each ring doubles the cell size of the previous one, providing high detail nearby and coarse detail in the distance — all from the same grid topology.

```
┌─────────────────────────────────┐
│  Level 2 (cell = 4)            │
│  ┌───────────────────────────┐  │
│  │  Level 1 (cell = 2)      │  │
│  │  ┌─────────────────────┐  │  │
│  │  │  Level 0 (cell = 1) │  │  │
│  │  │       [camera]      │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

- **Level 0**: Full grid (gridSize x gridSize), finest detail
- **Levels 1+**: Ring grids (inner hole cut out, filled by the finer level)
- **Outermost level**: No stitching needed (nothing beyond it)

### Camera Snapping

Each ring's origin snaps to a multiple of `2 * cellSize * 2^level`. This ensures the grid moves in discrete steps rather than continuously, avoiding vertex swimming. The snap-by-2 pattern guarantees that coarser rings always contain finer rings' vertex positions.

### Crack-Free Ring Stitching

Adjacent LOD rings have different vertex densities. Without special handling, T-junctions at ring boundaries cause visible cracks.

This package uses **boundary stitching**: each ring's outer edge uses a special triangulation where every other vertex is skipped, creating triangles that bridge 2 fine cells to 1 coarse cell:

```
Outer edge (matches coarser):  V . V . V . V    (every 2nd vertex)
                                \|/ \|/ \|/
Inner row (fine):               v v v v v v v    (every vertex)
```

This makes the meshes watertight by construction — no morphing or blending needed.

**Important**: `gridSize` must be of the form `4k + 1` (e.g. 65, 129, 257) so that even-indexed grid vertices map to even grid coordinates, which align perfectly with the coarser ring's vertex positions regardless of snap offset.

### Heightmap Sampling

The vertex shader samples an R32Float heightmap texture to displace each vertex's Y position. Since `r32float` textures don't support hardware filtering, the shader performs manual bilinear interpolation. Normals are computed from central differences in the heightmap.

## Quick Start

### With the Editor

When using `startEditor()`, clipmap terrain builtins are registered automatically. Just add a `ClipmapTerrain` component to a GameObject in your scene and create an init script:

```typescript
// scripts/ProceduralTerrain.ts
import { Component } from '@certe/atmos-core';
import { RenderSystem, createMaterial } from '@certe/atmos-renderer';
import { ClipmapTerrain, createClipmapPipeline } from '@certe/atmos-clipmap-terrain';

function terrainHeight(x: number, z: number): number {
  // Your height function here
  return Math.sin(x * 0.01) * 10 + Math.cos(z * 0.01) * 10;
}

export class ProceduralTerrain extends Component {
  private _initialized = false;

  onPlayStop(): void {
    this._initialized = false; // Re-init after editor pause/play
  }

  onRender(): void {
    if (this._initialized) return;
    const rs = RenderSystem.current;
    if (!rs) return;
    this._initialized = true;

    const device = rs.device;
    const pipeline = createClipmapPipeline(device);
    const material = createMaterial({
      albedo: [0.45, 0.55, 0.35, 1],
      roughness: 0.9,
      metallic: 0.0,
    });

    const terrain = this.gameObject.getComponent(ClipmapTerrain)
      ?? this.gameObject.addComponent(ClipmapTerrain);

    terrain.init(device, pipeline, {
      heightFn: terrainHeight,
      material,
    });
  }
}
```

### Without the Editor (Standalone)

```typescript
import { registerClipmapTerrainBuiltins } from '@certe/atmos-clipmap-terrain';

// Must register before deserializing scenes that contain ClipmapTerrain
registerClipmapTerrainBuiltins();
```

## Configuration

All settings are in `ClipmapConfig`, configurable via the editor inspector or code:

| Property | Default | Description |
|---|---|---|
| `gridSize` | `65` | Vertices per side. Must be `4k+1` (65, 129, 257...) |
| `cellSize` | `1` | World-space size of finest (level 0) cell |
| `levels` | `6` | Number of LOD rings |
| `heightmapResolution` | `1024` | Heightmap texture width/height in pixels |
| `heightmapWorldSize` | `2048` | World-space extent the heightmap covers |

### Tuning Guide

**Render distance** = `gridSize * cellSize * 2^(levels-1) / 2`

With defaults (65, 1, 6): `65 * 1 * 32 / 2 = 1040` world units.

| Goal | Change |
|---|---|
| Double render distance | `levels: 7` (cheapest — adds one ring) |
| Quadruple render distance | `levels: 8` |
| Finer close-up detail | `cellSize: 0.5` (halves cell size at all levels) |
| More vertices per ring | `gridSize: 129` (4x triangles per ring) |
| Higher heightmap detail | `heightmapResolution: 2048` |
| Larger world | `heightmapWorldSize: 4096` |

### Performance Considerations

- Each ring has `~gridSize^2` vertices. Doubling `gridSize` quadruples vertex count per ring.
- Adding a level is much cheaper than increasing `gridSize` — it adds one ring at the coarsest scale.
- `heightmapResolution` affects only the heightmap texture size, not vertex count.

## API Reference

### `ClipmapTerrain` (Component)

The main component. Add to a GameObject, then call `init()`.

```typescript
const terrain = go.addComponent(ClipmapTerrain);
terrain.init(device, pipeline, {
  heightFn: (x, z) => ...,  // Procedural height function
  material,                   // Optional: shared PBR material
  config: { levels: 8 },     // Optional: partial config overrides
});
```

**Properties:**
- `config: ClipmapConfig` — grid/LOD configuration
- `castShadow: boolean` — enable shadow casting (default `true`)
- `receiveSSAO: boolean` — enable SSAO depth pass (default `true`)
- `material: Material | null` — get/set the shared material for all rings
- `rings: readonly ClipmapMeshRenderer[]` — per-ring renderers (read-only)

**Methods:**
- `init(device, pipeline, options?)` — Initialize GPU resources and create ring hierarchy
- `updateHeightmap(heightFn)` — Re-rasterize the heightmap from a new height function
- `setHeightmapTexture(texture)` — Replace heightmap with a pre-made R32Float GPUTexture

**RendererPlugin interface** (called automatically by RenderSystem):
- `collect(vpMatrix, cameraEye, sceneBuffer)` — Snap rings to camera, write uniforms
- `draw(pass, shadowBindGroup)` — Main PBR render pass
- `drawShadow(pass)` — Shadow map pass
- `drawDepth(pass)` — Depth prepass (for SSAO)

### `createClipmapPipeline(device): ClipmapPipelineResources`

Creates the WebGPU render pipelines (main + shadow) and bind group layouts. Call once at init time.

**Bind group layout:**
- Group 0: Object UBO + Level UBO + Heightmap texture
- Group 1: Material UBO + Scene UBO + Albedo texture + Sampler
- Group 2: Shadow bind group (standard engine layout)

### `createFullGrid(gridSize, stitch?): ClipmapGridData`

Generate a full grid mesh for level 0.

- `gridSize` — Vertices per side (must be `4k+1`)
- `stitch` — Enable boundary stitching (default `true`)

### `createRingGrid(gridSize, stitch?): ClipmapGridData`

Generate a ring grid mesh for levels 1+. Inner hole is cut out.

- `gridSize` — Vertices per side (must be `4k+1`)
- `stitch` — Enable boundary stitching (default `true`)

### `ClipmapTerrainOptions`

```typescript
interface ClipmapTerrainOptions {
  heightFn?: HeightFn;          // (x, z) => y
  heightmapTexture?: GPUTexture; // Pre-made R32Float (overrides heightFn)
  material?: Material;           // Shared PBR material
  config?: Partial<ClipmapConfig>;
}
```

### `HeightFn`

```typescript
type HeightFn = (x: number, z: number) => number;
```

Returns world-space Y height for a given (x, z) position. Used to rasterize the heightmap texture at init time.

### `registerClipmapTerrainBuiltins()`

Registers `ClipmapTerrain` with the component registry so it can be serialized/deserialized in scenes. Called automatically by `startEditor()`. Only needed when using the engine without the editor.

## Architecture

```
clipmap-terrain/src/
├── types.ts                 # ClipmapConfig, HeightFn, uniform sizes
├── clipmap-grid.ts          # CPU mesh generation (full grid + ring grid + stitching)
├── clipmap-shader.ts        # WGSL shaders (vertex, PBR fragment, shadow)
├── clipmap-pipeline.ts      # WebGPU pipeline creation + bind group layouts
├── clipmap-mesh-renderer.ts # Per-ring Component (GPU buffers, uniforms, draw)
├── clipmap-terrain.ts       # Main Component (ring management, camera snap, heightmap)
├── register-builtins.ts     # Component registry integration
└── index.ts                 # Public exports
```

### Data Flow (Per Frame)

1. `ClipmapTerrain.collect()` is called by RenderSystem with camera position
2. Each ring's origin is snapped to a grid-aligned position based on its LOD level
3. Per-level uniforms (origin, scale, heightmap params) are written to GPU
4. MVP + model matrices are computed and written
5. `draw()` binds the pipeline and issues indexed draw calls for each ring
6. The vertex shader computes world XZ from grid coords + origin, samples the heightmap for Y, computes normals from central differences

### Vertex Format

Each vertex is 2 floats (8 bytes): integer grid coordinates `(ix, iz)`. The vertex shader converts these to world positions: `worldPos = origin + gridCoord * scale`. This minimal format keeps CPU mesh generation fast and GPU vertex buffers small.

### Shader Pipeline

- **Vertex**: Grid coord → world XZ → heightmap sample → world Y + normals
- **Fragment**: PBR Cook-Torrance with multi-light support, shadow sampling, fog
- **Shadow vertex**: Same displacement, outputs to light-space clip position

## Dependencies

- `@certe/atmos-core` — Component, GameObject, Scene
- `@certe/atmos-math` — Mat4 for MVP computation
- `@certe/atmos-renderer` — Mesh, Material, RenderSystem, PBR shader fragments
