# 🧮 @certe/atmos-math

Lightweight, zero-dependency math library for the Atmos Engine. Every type is a plain `Float32Array` — GPU-upload friendly, zero heap allocations on hot paths, and fully tree-shakeable.

---

## 📦 Modules

| Module | Type | Description |
|--------|------|-------------|
| `Vec3` | `Float32Array(3)` | 3D vectors |
| `Mat4` | `Float32Array(16)` | 4×4 matrices (column-major) |
| `Quat` | `Float32Array(4)` | Quaternions `[x, y, z, w]` |
| `Ray` | `{ origin: Vec3, direction: Vec3 }` | Rays for picking & intersection |
| Noise | — | Value noise, Perlin 3D, fBm |

---

## 🔑 Out-Param Pattern

All operations follow the same convention — the **first parameter is the output** and the function returns it for chaining:

```ts
import { Vec3, Mat4, Quat } from '@certe/atmos-math';

const a = Vec3.fromValues(1, 2, 3);
const b = Vec3.fromValues(4, 5, 6);
const out = Vec3.create();

Vec3.add(out, a, b);   // out = [5, 7, 9], returns out
Vec3.scale(out, out, 2); // out = [10, 14, 18]
```

This avoids garbage collection pressure in per-frame code.

---

## 🚀 Quick Start

```ts
import { Vec3, Mat4, Quat } from '@certe/atmos-math';

// Build a TRS matrix from quaternion rotation + position + scale
const pos = Vec3.fromValues(0, 5, -10);
const rot = Quat.create();
Quat.fromEuler(rot, 0, Math.PI / 4, 0);
const scl = Vec3.fromValues(1, 1, 1);

const world = Mat4.create();
Mat4.fromRotationTranslationScale(world, rot, pos, scl);
```

---

## 📖 API Overview

### Vec3

`create` · `fromValues` · `set` · `copy` · `add` · `sub` · `scale` · `dot` · `cross` · `length` · `distance` · `normalize` · `transformQuat` · `lerp`

### Mat4

`create` · `identity` · `multiply` · `translate` · `scale` · `rotateX/Y/Z` · `perspective` · `ortho` · `lookAt` · `invert` · `transpose` · `fromRotationTranslationScale`

### Quat

`create` · `identity` · `fromAxisAngle` · `fromEuler` · `fromMat4` · `toEuler` · `toMat4` · `multiply` · `normalize` · `slerp` · `invert` · `copy` · `rotateX/Y/Z`

### Ray

`create` · `fromScreenCoords` · `intersectSphere` · `intersectPlane` · `intersectTriangle` · `pointOnRay`

### Noise

`valueNoise2D` · `fbm` · `perlinNoise3D` · `fbm3D`

---

## 🧠 Design Principles

- **Float32Array everywhere** — matches GPU uniform/attribute layouts
- **Zero allocations in hot paths** — module-level scratch arrays for temporaries
- **Functional API** — no classes, no `this`, pure functions
- **Tree-shakeable** — import only what you use
- **No dependencies** — standalone package

---

## 📁 Structure

```
packages/math/src/
  index.ts       # Re-exports all modules
  vec3.ts        # 3D vector operations
  mat4.ts        # 4×4 matrix operations
  quat.ts        # Quaternion operations
  ray.ts         # Ray creation & intersection tests
  noise.ts       # Value noise, Perlin 3D, fBm
```

---

## 🔗 Dependencies

None.
