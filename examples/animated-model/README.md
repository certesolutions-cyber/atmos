# 🏃 Animated Model

Skeletal animation demo — loads a skinned glTF model, plays animation clips, and supports cross-fade transitions between clips via a dropdown selector.

---

## ▶️ How to Run

```bash
cd examples/animated-model
npx vite
```

Open `http://localhost:5173`. The example auto-loads `models/model.glb`.

---

## 🔑 What It Shows

- **GPU skinning** — `SkinnedMeshRenderer` with bone matrix storage buffer
- **AnimationMixer** — auto-created by `instantiateModel()` for skinned meshes
- **Clip switching** — dropdown to select clips, with 0.3s cross-fade
- **Component registration** — `registerCoreBuiltins()`, `registerRendererBuiltins()`, `registerAnimationBuiltins()`
- **Shadow support** — directional light with cascaded shadows on animated meshes

---

## 💡 Key Code

```ts
import { AnimationMixer } from '@certe/atmos-animation';

// After instantiateModel(), find all mixers in the hierarchy
function findAllMixers(root: GameObject): AnimationMixer[] {
  const mixers: AnimationMixer[] = [];
  for (const obj of scene.getAllObjects()) {
    const m = obj.getComponent(AnimationMixer);
    if (m) mixers.push(m);
  }
  return mixers;
}

// Cross-fade to a new clip
animSelect.addEventListener('change', () => {
  for (const mixer of mixers) {
    const oldLayer = mixer.layers[0];
    const newLayer = mixer.play(clip, { loop: true, weight: 0 });
    mixer.crossFade(oldLayer, newLayer, 0.3);
  }
});
```

---

## 🎨 Model Credits

The bundled model is ["Poppy Playtime (Chapter 5) Chum Chompkins"](https://skfb.ly/pGHXu) by ur_daughter, licensed under [Creative Commons Attribution 4.0](http://creativecommons.org/licenses/by/4.0/).

---

## 📁 Files

```
examples/animated-model/
  index.html      # Canvas + animation selector dropdown
  src/main.ts     # ~252 lines
  models/         # Skinned .glb files
```
