# Custom Shaders

Atmos supports custom fragment shaders written in WGSL. You write only the fragment function — the engine handles vertex transformation, bind group layout, uniform buffers, shadow integration, and post-processing.

## Quick Start

Create a `.wgsl` file in your project's `shaders/` directory:

```wgsl
/// @property tintColor: vec4 = (1.0, 0.5, 0.0, 1.0)
/// @property speed: float = 2.0
/// @texture noiseMap

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let time = scene.cameraPos.w;
    let uv = input.uv + vec2<f32>(time * custom.speed, 0.0);
    let noise = textureSample(noiseMap, noiseMapSampler, uv);
    return custom.tintColor * noise;
}
```

Assign the shader to a material in the editor by setting **Shader** to `custom` and choosing the `.wgsl` file.

## Metadata Syntax

Declare properties and textures as `///` comments at the top of your shader file.

### `@property`

```wgsl
/// @property name: type = (default values)
```

| Type   | Default format        | WGSL type        | Example                              |
|--------|-----------------------|------------------|--------------------------------------|
| `float`| `1.0` or `(1.0)`     | `f32`            | `/// @property speed: float = 2.0`   |
| `vec2` | `(x, y)`             | `vec2<f32>`      | `/// @property tiling: vec2 = (4.0, 4.0)` |
| `vec3` | `(r, g, b)`          | `vec3<f32>`      | `/// @property color: vec3 = (1.0, 0.5, 0.0)` |
| `vec4` | `(r, g, b, a)`       | `vec4<f32>`      | `/// @property tint: vec4 = (1.0, 1.0, 1.0, 1.0)` |

Properties are packed into a uniform buffer with std140 alignment (each property occupies a 16-byte slot). Access them in your shader via `custom.propertyName`.

### `@texture`

```wgsl
/// @texture textureName
```

Each `@texture` declaration creates two bindings: a `texture_2d<f32>` named `textureName` and a `sampler` named `textureNameSampler`. Assign texture files in the editor's material inspector.

Maximum **8 textures** per shader (`MAX_CUSTOM_TEXTURES`). Missing textures fall back to a 1×1 white pixel.

## Fragment Input

Your `main` function receives:

```wgsl
struct FragmentInput {
    @builtin(position) fragCoord: vec4<f32>,  // screen-space pixel coordinates
    @location(0) worldPosition: vec3<f32>,     // world-space position
    @location(1) worldNormal: vec3<f32>,       // world-space normal (interpolated)
    @location(2) uv: vec2<f32>,                // texture coordinates
};
```

Return `vec4<f32>` — linear HDR color with alpha. The engine applies tonemapping and gamma correction after your shader.

## Available Uniforms

### `custom` (Group 1, Binding 0)

Your declared `@property` values as a struct. Updated automatically when the user edits material properties.

### `scene` (Group 1, Binding 1)

Scene-wide data:

```wgsl
struct SceneUniforms {
    cameraPos: vec4<f32>,      // xyz = camera world position, w = time (seconds)
    numDirLights: u32,
    numPointLights: u32,
    numSpotLights: u32,
    _pad: u32,
    dirLights: array<DirLight, 4>,
    pointLights: array<PointLight, 4>,
    spotLights: array<SpotLight, 4>,
    nearPlane: f32,
    farPlane: f32,
    fogMode: u32,              // 0 = off, 1 = linear, 2 = exponential
    fogDensity: f32,
    fogStart: f32,
    fogEnd: f32,
    fogColor: vec3<f32>,
};
```

**Time** is available as `scene.cameraPos.w`.

### Light Structs

```wgsl
struct DirLight {
    direction: vec4<f32>,
    color: vec4<f32>,        // rgb = color, a = intensity
};

struct PointLight {
    position: vec4<f32>,
    color: vec4<f32>,        // rgb = color, a = intensity
    range: f32,
};

struct SpotLight {
    position: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,        // rgb = color, a = intensity
    range: f32,
    innerCos: f32,
    outerCos: f32,
};
```

## Built-in Helper Functions

The engine injects these helpers into every custom shader.

### Depth Helpers

```wgsl
fn linearizeDepth(d: f32, near: f32, far: f32) -> f32
```
Convert a normalized depth value `[0, 1]` to linear view-space distance.

```wgsl
fn getSceneDepth(fragCoord: vec4<f32>) -> f32
```
Sample the depth of opaque geometry behind the current fragment. Returns linear distance from the camera. Useful for soft edges, water depth effects, and intersection highlighting.

```wgsl
fn getFragmentDepth(fragCoord: vec4<f32>) -> f32
```
Get the linear depth of the current fragment. Compare with `getSceneDepth()` to compute thickness or underwater depth.

### PBR Lighting

```wgsl
fn computeLightLoop(
    N: vec3<f32>,           // surface normal
    V: vec3<f32>,           // view direction
    albedo: vec3<f32>,      // base color
    metallic: f32,
    roughness: f32,
    F0: vec3<f32>,          // reflectance at normal incidence
    worldPosition: vec3<f32>,
) -> vec3<f32>
```
Full PBR light loop over all directional, point, and spot lights with shadow evaluation. Returns accumulated radiance.

### Fog

```wgsl
fn applyFog(color: vec3<f32>, worldPosition: vec3<f32>) -> vec3<f32>
```
Apply scene fog settings (linear or exponential) to a color based on distance from camera.

### Constants

```wgsl
const PI: f32 = 3.14159265359;
const MAX_DIR_LIGHTS: u32 = 4u;
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;
```

## Bind Group Layout

Custom shaders use 4 bind groups:

| Group | Purpose | Contents |
|-------|---------|----------|
| 0 | Object | Model matrix, VP matrix, normal matrix (192 bytes) |
| 1 | Material | `custom` uniforms (binding 0), `scene` uniforms (binding 1), textures (bindings 2+) |
| 2 | Shadows | Shadow maps, comparison sampler, slot indirection |
| 3 | Depth | `sceneDepth` texture for depth-based effects |

Texture bindings in Group 1 are allocated in pairs starting at binding 2:

| Texture # | Texture Binding | Sampler Binding |
|-----------|-----------------|-----------------|
| 1st       | 2               | 3               |
| 2nd       | 4               | 5               |
| 3rd       | 6               | 7               |
| ...       | ...             | ...             |
| 8th       | 16              | 17              |

## Pipeline Behavior

- **Blending:** Alpha-blend (src-alpha, one-minus-src-alpha). Custom shaders are treated as transparent.
- **Depth:** Reads depth buffer but does **not** write to it. Drawn after all opaque geometry.
- **Culling:** Two-sided (no backface culling).
- **MSAA:** 4× multisampling.
- **Output format:** `rgba16float` (HDR). The post-process pipeline handles tonemapping.
- **Vertex format:** Standard 32-byte stride (position `vec3`, normal `vec3`, UV `vec2`). Optional vertex displacement via `/// @vertex`.

## Material Asset (`.mat.json`)

Custom shader materials are stored as JSON:

```json
{
  "name": "My Water",
  "shader": "custom",
  "albedo": [1, 1, 1, 1],
  "metallic": 0,
  "roughness": 0.5,
  "customShaderPath": "shaders/water.wgsl",
  "customUniforms": {
    "shallowColor": [0.0, 0.13, 0.22, 0.6],
    "depthFalloff": 2.0,
    "waveSpeed": 3.0
  },
  "customTextures": {
    "envMap": "textures/environment.png"
  }
}
```

- `customShaderPath` — relative path to the `.wgsl` file
- `customUniforms` — override values for `@property` declarations (omitted properties use shader defaults)
- `customTextures` — texture file paths keyed by `@texture` name

## Hot Reload

In the editor, saving a `.wgsl` file triggers automatic pipeline recompilation via `RenderSystem.invalidateCustomPipeline()`. Changes appear immediately without restarting.

## Vertex Displacement

Custom shaders can optionally include a vertex displacement function using the `/// @vertex` marker. This enables wave animation, wind deformation, terrain displacement, and other vertex-level effects.

### Syntax

Place the `/// @vertex` marker after your property declarations. Everything between `/// @vertex` and `@fragment fn` is vertex code:

```wgsl
/// @property amplitude: float = 1.0
/// @property speed: float = 2.0

/// @vertex
fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    let time = scene.cameraPos.w;
    return position + normal * sin(position.x * 4.0 + time * custom.speed) * custom.amplitude;
}

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    // fragment code...
}
```

### Requirements

- You **must** define `fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32>`
- Displacement happens in **local space** (before model/MVP transform)
- Available in vertex code: `custom.*` uniforms, `scene.*` (including `scene.cameraPos.w` = time), `object.*` (model, normalMatrix)
- Textures are **not** available in the vertex stage (fragment only)
- The normal is **not** automatically updated after displacement. For corrected normals, compute them in the fragment shader using `dpdx`/`dpdy` derivatives.

### Shadow Integration

When a custom shader has vertex displacement, the engine automatically generates a matching shadow vertex shader. This ensures shadow maps reflect the displaced geometry. The shadow pipeline uses the same `displaceVertex` function with access to `custom.*` and `scene.*` uniforms.

Without `/// @vertex`, shaders work exactly as before (fragment-only, no shadow pipeline changes).

## Limitations

- **Property types** — only `float`, `vec2`, `vec3`, `vec4`. No matrices, arrays, or integers.
- **Max 8 textures** per shader.
- **Always transparent** — custom shaders do not write depth, so they render after opaque objects.

## Example: Water Shader

See `examples/editor-demo/shaders/water.wgsl` for a production-quality water shader demonstrating:

- 8 Gerstner-style waves with analytical normals
- Depth-based shallow/deep color blending via `getSceneDepth()`
- Fresnel reflection with environment map sampling
- Subsurface scattering from directional lights
- Animated caustics pattern
- Slope-based foam with noise
- Per-light specular highlights
- Fog integration

The shader uses 17 properties and 1 texture to create a fully configurable water surface.
