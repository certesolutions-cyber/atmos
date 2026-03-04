# Atmos Engine — Rules for AI Agents

## Example & Game main.ts — STRICT RULE

**Do NOT write logic, scene setup, or imperative code in `main.ts` files.**

`main.ts` must only:
1. Import side-effect script modules (e.g. `import "./scripts/MyScript.js"`)
2. Call `startEditor()` (or `startPlayer()` for builds) with minimal config
3. Optionally pass `physics` or `scriptModules` to `startEditor()`

Everything else belongs in:
- **Scene JSON** (`scenes/*.scene.json`) — GameObjects, Components, properties, hierarchy
- **Script Components** (`src/scripts/*.ts`) — Runtime logic as Component subclasses with lifecycle hooks (`onAwake`, `onUpdate`, `onRender`, etc.)

### Correct pattern

```typescript
// main.ts — THIS IS ALL THAT BELONGS HERE
import { startEditor } from "@certe/atmos-editor";
import "./scripts/MyScript.js";

await startEditor({});
```

### What NEVER goes in main.ts

- WebGPU device/context initialization
- Scene graph construction (`new GameObject(...)`, `addComponent(...)`)
- Camera positioning or orbit camera setup
- Material/mesh/light creation
- Physics world setup
- Render loops or animation frames
- DOM manipulation (canvas, UI)
- Any `setupScene` callbacks — use scene JSON instead

### Why

The editor saves/loads scenes as JSON. Code in `main.ts` bypasses serialization, breaks pause/play, and creates state that the editor cannot inspect or persist. Components with lifecycle hooks are the correct extension point.
