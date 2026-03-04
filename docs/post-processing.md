# Post-Processing Pipeline

Atmos renders to an HDR framebuffer (rgba16float) with 4× MSAA, then applies a chain of post-processing passes before outputting to the screen.

## Pipeline Overview

```
Main Render Pass (MSAA 4x → resolve to HDR)
    ↓
Depth Prepass (if SSAO enabled)
    ↓
SSAO Pass → blur → AO texture
    ↓
Bloom Pass → downsample chain → upsample chain → bloom texture
    ↓
Tonemap Pass (HDR + AO + bloom → exposure → ACES → gamma → vignette → dither → swapchain)
```

All post-process passes use a fullscreen triangle (no vertex buffer needed).

## Passes

### Depth Prepass

Renders scene depth to a non-MSAA `depth32float` texture. Required by SSAO and available to custom shaders via `sceneDepth` (bind group 3).

- Only renders objects with `receiveSSAO = true`
- Separate from the main depth buffer (which is MSAA)
- Automatically resized on canvas resize

### SSAO (Screen-Space Ambient Occlusion)

Approximates ambient occlusion by sampling the depth buffer around each pixel.

**Algorithm:**
1. Reconstruct view-space position from depth
2. Reconstruct view-space normal using smallest-depth-delta method (avoids edge artifacts by comparing left/right and top/bottom depth deltas)
3. Build TBN matrix from normal + 4×4 random rotation texture (Gram-Schmidt)
4. Sample 16 hemisphere points, project to screen, compare depths
5. Range-checked occlusion with smooth falloff
6. 4×4 box blur to reduce noise

**Parameters:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `enabled` | `true` | on/off | Toggle SSAO |
| `radius` | `0.5` | 0.05–2.0 | Sample radius in world units |
| `intensity` | `1.5` | 0–5.0 | AO strength multiplier |
| `bias` | `0.025` | 0–0.2 | Depth bias to prevent self-occlusion |

**Output:** Single-channel `r16float` texture (1.0 = no occlusion, 0.0 = fully occluded).

When disabled, returns a 1×1 white fallback texture (no performance cost).

### Bloom

Extracts bright pixels and creates a soft glow effect using a multi-resolution filter chain.

**Algorithm:**
1. **Downsample** HDR texture through 5 mip levels (1/2, 1/4, 1/8, 1/16, 1/32 resolution)
   - First pass applies brightness threshold: pixels below threshold are zeroed out
   - Uses 13-tap weighted filter (Call of Duty anti-firefly pattern) to prevent flickering
2. **Upsample** back through 4 levels with 9-tap tent filter, additively blending each level

**Parameters:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `intensity` | `0.5` | 0–5.0 | Bloom contribution to final image |
| `threshold` | `1.0` | 0–10.0 | Brightness cutoff (HDR values above this bloom) |
| `radius` | `0.5` | 0–2.0 | Filter kernel radius for upsampling |

**Output:** Half-resolution `rgba16float` texture containing the bloom contribution.

### Tonemap

Final composite pass that converts HDR to display-ready LDR.

**Processing order:**
1. **Composite:** `hdr × ao + bloom × bloomIntensity`
2. **Exposure:** Multiply by exposure value (pre-tonemap brightness control)
3. **ACES Filmic Tonemap:** Maps HDR range to [0, 1] using the Narkowicz 2015 ACES approximation
4. **Gamma Correction:** Linear → sRGB (`pow(color, 1/2.2)`)
5. **Vignette:** Darkens screen edges with smoothstep falloff from center
6. **Dither:** Triangular-PDF noise (±1/255) to eliminate 8-bit color banding

**Parameters:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `exposure` | `1.0` | 0.1–5.0 | Pre-tonemap brightness multiplier |
| `vignetteIntensity` | `0.3` | 0–1.0 | Edge darkening strength |
| `vignetteRadius` | `0.75` | 0.3–1.2 | Distance from center where darkening begins |

**Output:** Swapchain texture (typically `bgra8unorm`).

## Fog

Fog is computed in the main render pass (PBR and custom shaders), not as a post-process effect.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `fogEnabled` | `false` | Toggle fog |
| `fogMode` | `'linear'` | `'linear'` or `'exponential'` |
| `fogStart` | `10` | Linear fog start distance |
| `fogEnd` | `100` | Linear fog end distance |
| `fogDensity` | `0.02` | Exponential fog density |
| `fogColor` | `[0.7, 0.75, 0.8]` | Fog color (RGB) |

Custom shaders can apply fog via the `applyFog(color, worldPosition)` helper.

## Texture Flow

| Texture | Format | Size | Created By | Read By |
|---------|--------|------|------------|---------|
| MSAA color | `rgba16float` | Full, 4x samples | Main pass | Resolve target |
| HDR resolve | `rgba16float` | Full | MSAA resolve | Bloom, Tonemap |
| Main depth | `depth32float` | Full, 4x samples | Main pass | Main pass depth test |
| Prepass depth | `depth32float` | Full | Depth prepass | SSAO, Custom shaders |
| SSAO raw | `r16float` | Full | SSAO pass | SSAO blur |
| SSAO blurred | `r16float` | Full | SSAO blur | Tonemap |
| Bloom mips | `rgba16float` | 1/2 → 1/32 | Bloom down/up | Tonemap (mip 0) |

All textures are automatically recreated on canvas resize via `resizeGPU()`.

## Editor Controls

The **Post-Processing** panel in the editor exposes all parameters:

- **Exposure** — global brightness
- **SSAO** — toggle + radius / intensity / bias
- **Bloom** — intensity / threshold / radius
- **Vignette** — intensity / radius
- **Fog** — toggle + mode / density / start / end / color
- **Debug** — wireframe toggle

Changes take effect immediately (no recompilation needed).

## API Usage

All post-process settings are public properties on `RenderSystem`:

```typescript
const renderSystem = RenderSystem.current;

// Bloom
renderSystem.bloomIntensity = 0.8;
renderSystem.bloomThreshold = 1.5;
renderSystem.bloomRadius = 0.6;

// SSAO
renderSystem.ssaoEnabled = true;
renderSystem.ssaoRadius = 0.5;
renderSystem.ssaoBias = 0.025;
renderSystem.ssaoIntensity = 1.5;

// Tonemap
renderSystem.exposure = 1.2;
renderSystem.vignetteIntensity = 0.3;
renderSystem.vignetteRadius = 0.75;

// Fog
renderSystem.fogEnabled = true;
renderSystem.fogMode = 'exponential';
renderSystem.fogDensity = 0.02;
renderSystem.fogColor = new Float32Array([0.7, 0.75, 0.8]);
```
