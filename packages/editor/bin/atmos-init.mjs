#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

console.log('Initializing Atmos project...\n');

// 1. Ensure package.json exists
if (!fs.existsSync(path.join(root, 'package.json'))) {
  console.log('Creating package.json...');
  execSync('npm init -y', { stdio: 'inherit', cwd: root });
}

// Ensure "type": "module" in package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
if (pkg.type !== 'module') {
  pkg.type = 'module';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('Set "type": "module" in package.json');
}

// 2. vite.config.ts
const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { atmosPlugin } from '@certe/atmos-editor/vite';

export default defineConfig({
  plugins: [react(), atmosPlugin()],
});
`;

if (!fs.existsSync(path.join(root, 'vite.config.ts'))) {
  fs.writeFileSync(path.join(root, 'vite.config.ts'), viteConfig);
  console.log('Created vite.config.ts');
} else {
  console.log('vite.config.ts already exists, skipping');
}

// 3. src/main.ts
const mainTs = `import { startEditor, createEditorPhysics } from '@certe/atmos-editor';

await startEditor({
  physics: await createEditorPhysics(),
  scriptModules: import.meta.glob('./scripts/*.ts', { eager: true }),
});
`;

fs.mkdirSync(path.join(root, 'src', 'scripts'), { recursive: true });

if (!fs.existsSync(path.join(root, 'src', 'main.ts'))) {
  fs.writeFileSync(path.join(root, 'src', 'main.ts'), mainTs);
  console.log('Created src/main.ts');
} else {
  console.log('src/main.ts already exists, skipping');
}

// 4. tsconfig.json
const tsconfig = {
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    types: ['vite/client'],
  },
  include: ['src'],
};

if (!fs.existsSync(path.join(root, 'tsconfig.json'))) {
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  console.log('Created tsconfig.json');
} else {
  console.log('tsconfig.json already exists, skipping');
}

// 5. Install dependencies
console.log('\nInstalling dependencies...');
execSync('npm install @certe/atmos-physics', { stdio: 'inherit', cwd: root });
execSync('npm install -D vite @vitejs/plugin-react typescript', { stdio: 'inherit', cwd: root });

// 6. Add scripts to package.json if missing
const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
updatedPkg.scripts = updatedPkg.scripts || {};
if (!updatedPkg.scripts.dev) updatedPkg.scripts.dev = 'vite';
if (!updatedPkg.scripts.build) updatedPkg.scripts.build = 'vite build';
if (!updatedPkg.scripts.preview) updatedPkg.scripts.preview = 'vite preview';
fs.writeFileSync(pkgPath, JSON.stringify(updatedPkg, null, 2) + '\n');

// 7. Generate README.md with engine guide
const readme = `# Atmos Game Project

## Quick Start

\`\`\`bash
npm run dev      # Start editor at localhost:5173
npm run build    # Build standalone game (no editor)
npm run preview  # Preview built game
\`\`\`

## Project Structure

\`\`\`
src/
  main.ts              # Editor bootstrap (DO NOT add game logic here)
  scripts/             # Game scripts — all gameplay code goes here
    MyScript.ts
scenes/
  main.scene.json      # Scene files (created/saved from editor)
materials/
  default.mat.json     # Material assets
textures/              # Image textures (.jpg, .png)
models/                # 3D models (.glb)
project-settings.json  # Editor settings (default scene, physics)
vite.config.ts         # Vite + Atmos plugin config
\`\`\`

## Imports — What Comes From Where

\`\`\`typescript
// Core — components, scene, engine, input
import { Component, GameObject, Scene, Transform, Input, Engine, Time } from '@certe/atmos-core';
import { serializeScene, deserializeScene } from '@certe/atmos-core';

// Math — vectors, quaternions, matrices, rays
import { Vec3, Quat, Mat4, Ray } from '@certe/atmos-math';

// Renderer — camera, lights, meshes, materials
import { Camera, MeshRenderer } from '@certe/atmos-renderer';
import { DirectionalLight, PointLight, SpotLight } from '@certe/atmos-renderer';
import { createMaterial, createMesh } from '@certe/atmos-renderer';
import { createCubeGeometry, createSphereGeometry, createPlaneGeometry, createCylinderGeometry } from '@certe/atmos-renderer';

// Physics — rigid bodies, colliders, joints, queries
import { RigidBody, Collider, Physics } from '@certe/atmos-physics';
import { HingeJoint, FixedJoint, SpringJoint } from '@certe/atmos-physics';

// Animation — skeletal animation
import { AnimationMixer } from '@certe/atmos-animation';
\`\`\`

## Writing Game Scripts

All game logic lives in \`src/scripts/\`. Each file exports Component subclasses
that are auto-discovered by the editor. **Never put game logic in main.ts.**

\`\`\`typescript
import { Component } from '@certe/atmos-core';
import { Vec3, Quat } from '@certe/atmos-math';

export class Rotator extends Component {
  speed = 2;

  // Expose properties to the editor inspector
  static editorProperties = [
    { key: 'speed', type: 'number' as const, min: 0, max: 20, step: 0.1 },
  ];

  onUpdate(dt: number) {
    const q = this.transform.rotation;
    const rot = Quat.create();
    Quat.fromAxisAngle(rot, Vec3.fromValues(0, 1, 0), this.speed * dt);
    Quat.multiply(q, rot, q);
    this.transform.setRotationFrom(q);
  }
}
\`\`\`

### Component Lifecycle

\`\`\`
onAwake()           — Called once when play mode starts
onStart()           — Called once after all awake calls
onPlayStart()       — Called when entering play mode (add listeners here)
onPlayStop()        — Called when leaving play mode (remove listeners here)
onUpdate(dt)        — Called every frame (dt = seconds since last frame)
onRender()          — Called after update, before GPU rendering
onDestroy()         — Called when component or game object is removed
\`\`\`

Use \`onPlayStart()\` / \`onPlayStop()\` for event listeners that should only
be active during play mode:

\`\`\`typescript
export class FPSController extends Component {
  private _onPointerLock = () => { this.locked = document.pointerLockElement !== null; };

  onPlayStart() {
    document.addEventListener('pointerlockchange', this._onPointerLock);
  }

  onPlayStop() {
    document.removeEventListener('pointerlockchange', this._onPointerLock);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
\`\`\`

### Accessing Other Components

\`\`\`typescript
// Get sibling component on same GameObject
const rb = this.getComponent(RigidBody);

// Search entire scene
const cameras = Component.findAll(Camera);
\`\`\`

### Input

\`\`\`typescript
import { Input } from '@certe/atmos-core';

onUpdate(dt: number) {
  const input = Input.current!;

  if (input.getKey('KeyW'))        // Held down
  if (input.getKeyDown('Space'))   // Just pressed this frame
  if (input.getKeyUp('KeyE'))      // Just released this frame

  if (input.getMouseButton(0))     // Left mouse held
  const { x, y } = input.mouseDelta;  // Mouse movement
}
\`\`\`

Key codes: \`KeyW\`, \`KeyA\`, \`KeyS\`, \`KeyD\`, \`Space\`, \`ShiftLeft\`, \`ArrowUp\`,
\`ArrowDown\`, \`ArrowLeft\`, \`ArrowRight\`, \`Digit1\`–\`Digit9\`, \`KeyE\`, \`KeyQ\`, etc.

## Math API

All math types are Float32Array. Functions use \`out\` as the first parameter
(output is written into \`out\` and returned). **No allocations in hot paths.**

\`\`\`typescript
import { Vec3, Quat, Mat4 } from '@certe/atmos-math';

// Vec3 — Float32Array[3]
const v = Vec3.fromValues(1, 2, 3);
const result = Vec3.create();
Vec3.set(result, x, y, z);
Vec3.copy(result, v);
Vec3.add(result, a, b);
Vec3.sub(result, a, b);
Vec3.scale(result, v, 2.0);
Vec3.normalize(result, v);
Vec3.cross(result, a, b);
Vec3.lerp(result, a, b, 0.5);
Vec3.dot(a, b);              // returns number
Vec3.length(v);              // returns number
Vec3.distance(a, b);         // returns number
Vec3.transformQuat(out, v, q);  // rotate vector by quaternion

// Quat — Float32Array[4] as [x, y, z, w]
const q = Quat.create();                          // identity
Quat.fromAxisAngle(q, axis, radians);
Quat.fromEuler(q, xRad, yRad, zRad);
Quat.lookRotation(q, forwardDir);                 // orient -Z toward direction
Quat.lookRotation(q, forwardDir, upHint);         // with custom up vector
Quat.multiply(out, a, b);
Quat.slerp(out, a, b, t);                         // spherical interpolation
Quat.invert(out, q);
Quat.normalize(out, q);
Quat.rotateX(out, q, radians);                    // rotate around local axis
Quat.rotateY(out, q, radians);
Quat.rotateZ(out, q, radians);
Quat.toEuler(vec3Out, q);                         // extract euler angles
Quat.copy(out, q);
Vec3.transformQuat(out, vec, quat);                // rotate vector by quaternion

// Mat4 — Float32Array[16], column-major
Mat4.perspective(out, fovY, aspect, near, far);
Mat4.lookAt(out, eye, center, up);
Mat4.multiply(out, a, b);
Mat4.invert(out, a);
\`\`\`

## Scene Files

Scenes are JSON. The editor saves/loads them automatically. You can also
create GameObjects programmatically in a script's \`onAwake\`, but prefer
building scenes in the editor and saving to \`scenes/*.scene.json\`.

### Scene JSON format

\`\`\`json
{
  "gameObjects": [
    {
      "name": "Floor",
      "id": 1,
      "parentId": null,
      "components": [
        {
          "type": "Transform",
          "data": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [10, 0.1, 10] }
        },
        {
          "type": "MeshRenderer",
          "data": { "meshSource": "primitive:cube", "materialSource": "materials/default.mat.json" }
        },
        {
          "type": "RigidBody",
          "data": { "bodyType": "fixed" }
        },
        {
          "type": "Collider",
          "data": { "shape": { "type": "box", "halfExtents": { "x": 5, "y": 0.05, "z": 5 } } }
        }
      ]
    }
  ]
}
\`\`\`

### Mesh sources (meshSource)

- \`"primitive:cube"\` — Unit cube
- \`"primitive:sphere"\` — Sphere (radius 0.5)
- \`"primitive:plane"\` — Flat plane (1x1)
- \`"primitive:cylinder"\` — Cylinder (radius 0.5, height 1)

### Material files (.mat.json)

\`\`\`json
{
  "name": "Metal",
  "shader": "pbr",
  "albedo": [0.8, 0.8, 0.8, 1.0],
  "metallic": 0.9,
  "roughness": 0.2,
  "emissive": [0, 0, 0],
  "emissiveIntensity": 0
}
\`\`\`

Set \`emissive\` + \`emissiveIntensity\` > 0 for glowing objects (works with bloom).

## Built-in Components

### Rendering
- **MeshRenderer** — meshSource, materialSource, castShadow, receiveSSAO
- **Camera** — fovY (radians), near, far, isMainCamera, clearColor

### Lights
- **DirectionalLight** — color, intensity, castShadows, shadowIntensity
- **PointLight** — color, intensity, range, castShadows
- **SpotLight** — color, intensity, range, innerAngle, outerAngle, castShadows

### Physics
- **RigidBody** — bodyType (dynamic/fixed/kinematic), linearDamping, angularDamping, gravityScale
- **Collider** — shape (box/sphere/capsule/cylinder), friction, restitution, density, isSensor
- **HingeJoint** — axis, connectedBody, limits, motor

### Animation
- **AnimationMixer** — initialClip, speed, loop, autoplay

## Physics

\`\`\`typescript
import { RigidBody, Collider, Physics } from '@certe/atmos-physics';
import { Vec3 } from '@certe/atmos-math';

// Apply force / impulse (wrapper methods, safe even if body isn't ready yet)
const rb = this.getComponent(RigidBody);
rb.addImpulse(0, 10, 0);
rb.addForce(0, 50, 0);

// Raycast (Physics.current is set automatically)
const origin = Vec3.fromValues(0, 1, 0);
const dir = Vec3.fromValues(0, 0, -1);
const hit = Physics.raycast(origin, dir, 100);
if (hit) {
  console.log(hit.gameObject.name, hit.point, hit.distance);
}

// Overlap queries
const center = Vec3.fromValues(0, 0, 0);
const sphereHit = Physics.sphereCast(center, 2.0);
const boxHits = Physics.boxCastAll(center, Vec3.fromValues(1, 1, 1));
\`\`\`

### Creating GameObjects at Runtime

MeshRenderer auto-resolves \`meshSource\` and \`materialSource\` strings.
Physics components auto-initialize on the next physics step.
No manual \`init()\` calls needed:

\`\`\`typescript
import { Component, GameObject, Scene, Input } from '@certe/atmos-core';
import { MeshRenderer } from '@certe/atmos-renderer';
import { RigidBody, Collider } from '@certe/atmos-physics';

export class BallSpawner extends Component {
  onUpdate(dt: number) {
    if (!Input.current!.getKeyDown('Space')) return;

    const ball = new GameObject('Ball');
    Scene.current!.add(ball);
    ball.transform.setPosition(0, 5, 0);

    // Mesh (auto-resolved by RenderSystem)
    const mr = ball.addComponent(MeshRenderer);
    mr.meshSource = 'primitive:sphere';
    mr.materialSource = 'materials/ball.mat.json';  // loads .mat.json file
    // Or set material directly: mr.material = createMaterial({ albedo: [1, 0, 0, 1] });

    // Physics (auto-initialized next frame)
    const rb = ball.addComponent(RigidBody);
    rb.bodyType = 'dynamic';

    const col = ball.addComponent(Collider);
    col.shape = { type: 'sphere', radius: 0.5 };
    col.restitution = 0.8;
  }
}

// Cleanup — removing from scene auto-cleans GPU + Rapier resources:
// Scene.current!.remove(ball);
\`\`\`

## Editor Properties

Expose script fields to the inspector:

\`\`\`typescript
export class Enemy extends Component {
  health = 100;
  speed = 3;
  color = new Float32Array([1, 0, 0]);
  isFlying = false;
  difficulty: string = 'normal';
  target: GameObject | null = null;

  static editorProperties = [
    { key: 'health', type: 'number' as const, min: 0, max: 1000, step: 10 },
    { key: 'speed', type: 'number' as const, min: 0, max: 20, step: 0.5 },
    { key: 'color', type: 'color' as const },
    { key: 'isFlying', type: 'boolean' as const },
    { key: 'difficulty', type: 'enum' as const, options: ['easy', 'normal', 'hard'] },
    { key: 'target', type: 'gameObjectRef' as const },
  ];
}
\`\`\`

Property types: \`number\`, \`string\`, \`boolean\`, \`vec3\`, \`quat\`, \`color\`,
\`enum\`, \`gameObjectRef\`, \`materialAsset\`

## AI Agent Instructions

> **WARNING — FILE PLACEMENT IS CRITICAL. Getting this wrong breaks the engine.**
> The ONLY directory inside \`src/\` is \`src/scripts/\`. Everything else is at the PROJECT ROOT.
> **NEVER create \`src/scenes/\`, \`src/materials/\`, \`src/textures/\`, or \`src/models/\`.**

### File placement rules

| What | Correct path | WRONG — never do this |
|---|---|---|
| Game scripts | \`src/scripts/MyScript.ts\` | \`src/MyScript.ts\`, \`main.ts\` |
| Scene files | \`scenes/main.scene.json\` | \`src/scenes/\`, \`src/main.scene.json\` |
| Material files | \`materials/metal.mat.json\` | \`src/materials/\`, \`src/metal.mat.json\` |
| Textures | \`textures/grass.png\` | \`src/textures/\` |
| Models | \`models/character.glb\` | \`src/models/\` |

### Rules

1. **All game logic goes in \`src/scripts/\`** as Component subclasses
2. **Scene files go in \`scenes/*.scene.json\`** at project root — the editor and build system read from this exact path
3. **Material files go in \`materials/*.mat.json\`** at project root — reference them in scene JSON and MeshRenderer.materialSource as \`"materials/metal.mat.json"\` (relative to project root)
4. **Textures go in \`textures/\`** at project root — reference in .mat.json as \`"textures/grass.png"\`
5. **Models go in \`models/\`** at project root
6. **main.ts is engine bootstrap only** — never modify it for game logic
7. **Use \`static editorProperties\`** so the editor can display and tweak values
8. **Math uses out-params** — always \`Vec3.add(out, a, b)\`, never \`a.add(b)\`
9. **Scripts are hot-reloaded** — the editor picks up new files in src/scripts/ automatically
10. **The default scene is \`scenes/main.scene.json\`** — the editor loads this on startup

### Creating materials

Create \`.mat.json\` files in \`materials/\` (project root):

    materials/floor.mat.json     <-- CORRECT
    materials/metal.mat.json     <-- CORRECT
    src/materials/floor.mat.json <-- WRONG, engine will NOT find this

Then reference them in scene JSON by their project-root-relative path:

    { "type": "MeshRenderer", "data": { "materialSource": "materials/floor.mat.json" } }
`;

if (!fs.existsSync(path.join(root, 'README.md'))) {
  fs.writeFileSync(path.join(root, 'README.md'), readme);
  console.log('Created README.md');
} else {
  console.log('README.md already exists, skipping');
}

console.log('\nDone! Run "npm run dev" to start the editor.');
