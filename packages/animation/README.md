# 🎬 @certe/atmos-animation

Skeletal animation system for the Atmos Engine. Provides skeleton data structures, keyframe sampling, pose blending, and an `AnimationMixer` component for clip playback and cross-fading.

---

## 🔑 Key Concepts

- **Skeleton** — Joint hierarchy with inverse bind matrices and a rest pose
- **AnimationClip** — Named collection of keyframe tracks targeting individual joints
- **AnimationMixer** — Component that plays clips, blends weighted layers, and outputs bone matrices for GPU skinning

---

## 🚀 Quick Start

```ts
import { AnimationMixer, createSkeleton, createAnimationClip } from '@certe/atmos-animation';

// Typically created automatically by instantiateModel() for glTF skinned meshes
const mixer = gameObject.addComponent(AnimationMixer);
mixer.skeleton = skeleton;
mixer.addClip(walkClip);
mixer.addClip(runClip);

// Play
const walkLayer = mixer.play(walkClip, { loop: true });

// Cross-fade to run over 0.3 seconds
const runLayer = mixer.play(runClip, { loop: true, weight: 0 });
mixer.crossFade(walkLayer, runLayer, 0.3);
```

---

## 📖 API Overview

### Skeleton

```ts
import { createSkeleton, getInverseBindMatrix } from '@certe/atmos-animation';

const skeleton = createSkeleton(
  joints,               // Array<{ name, parentIndex }>
  inverseBindMatrices,  // Float32Array (jointCount × 16)
  restT, restR, restS   // Optional rest pose arrays
);

// Read one joint's IBM
const ibm = Mat4.create();
getInverseBindMatrix(ibm, skeleton, jointIndex);
```

### AnimationClip & Tracks

```ts
import { createAnimationClip } from '@certe/atmos-animation';

const clip = createAnimationClip('walk', [
  {
    jointIndex: 0,
    channel: 'rotation',
    interpolation: 'LINEAR',
    times: new Float32Array([0, 0.5, 1.0]),
    values: new Float32Array([/* quaternion keyframes */]),
  },
]);
// clip.duration is auto-computed from max track time
```

### Keyframe Sampling

```ts
import { sampleTrack } from '@certe/atmos-animation';

const out = new Float32Array(4); // 4 for rotation, 3 for translation/scale
sampleTrack(out, track, time);
// Binary search + LINEAR (lerp/slerp) or STEP interpolation
```

### AnimationMixer Component

| Method | Description |
|---|---|
| `play(clip, opts?)` | Play a clip, returns `AnimationLayer` |
| `playByName(name, opts?)` | Play by clip name with optional cross-fade |
| `crossFade(from, to, duration)` | Smooth transition between layers |
| `stop(layer)` | Stop and remove a layer |
| `resetToRestPose()` | Clear all layers |
| `addClip(clip)` | Register a clip for `playByName` |

| Property | Description |
|---|---|
| `skeleton` | The `Skeleton` to animate |
| `boneMatrices` | `Float32Array` output (jointCount × 16) for GPU upload |
| `clipNames` | Sorted list of registered clip names |
| `speed` | Global playback speed multiplier |
| `loop` | Default looping behavior |

### Blending Algorithm

Each frame, `onUpdate(dt)`:

1. Sample all active layers' tracks at their current time
2. Blend translation/scale as **delta-from-rest** weighted by layer weight
3. Blend rotation via **weighted quaternion accumulation** with shortest-path sign flip
4. Fill undriven joints with rest pose
5. Call `computeBoneMatrices()` to produce final GPU-ready matrices

---

## 📁 Structure

```
packages/animation/src/
  index.ts            # Public API
  skeleton.ts         # Skeleton type + factory
  animation-clip.ts   # AnimationClip + KeyframeTrack
  keyframe-sampler.ts # Binary search + lerp/slerp (zero-alloc)
  pose.ts             # computeBoneMatrices() — two-pass world × IBM
  animation-mixer.ts  # AnimationMixer component
  animation-handler.ts # Animation event handling
  register-builtins.ts # Component registry integration
```

---

## 🔗 Dependencies

- `@certe/atmos-core` — Component lifecycle
- `@certe/atmos-math` — Vec3, Mat4, Quat for pose computation and interpolation
