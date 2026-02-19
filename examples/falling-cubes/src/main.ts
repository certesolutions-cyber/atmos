import { Engine, Scene, GameObject } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import {
  initWebGPU,
  createRenderPipeline,
  createCubeGeometry,
  createPlaneGeometry,
  createMesh,
  createMaterial,
  createDirectionalLight,
  MeshRenderer,
  RenderSystem,
  createDefaultCamera,
} from '@atmos/renderer';
import {
  initRapier,
  PhysicsWorld,
  PhysicsSystem,
  RigidBody,
  Collider,
} from '@atmos/physics';

const CUBE_COLORS: [number, number, number, number][] = [
  [1.0, 0.2, 0.2, 1],
  [0.2, 0.8, 0.3, 1],
  [0.3, 0.3, 1.0, 1],
  [1.0, 0.7, 0.2, 1],
  [0.8, 0.2, 0.8, 1],
  [0.2, 0.9, 0.9, 1],
  [1.0, 0.5, 0.1, 1],
  [0.5, 1.0, 0.2, 1],
  [0.9, 0.9, 0.2, 1],
  [0.6, 0.3, 0.9, 1],
];

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  // Init WebGPU + Rapier in parallel
  const [gpu, RAPIER] = await Promise.all([initWebGPU(canvas), initRapier()]);
  void RAPIER; // only needed for WASM init side-effect

  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  // Shared geometry
  const cubeGeo = createCubeGeometry();
  const cubeMesh = createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices);
  const planeGeo = createPlaneGeometry(20, 20);
  const planeMesh = createMesh(gpu.device, planeGeo.vertices, planeGeo.indices);

  // Physics world
  const physicsWorld = new PhysicsWorld({ gravity: { x: 0, y: -9.81, z: 0 } });

  // --- Floor ---
  const floorMat = createMaterial({ albedo: [0.4, 0.4, 0.4, 1], metallic: 0.0, roughness: 0.9 });
  const floor = new GameObject('Floor');
  floor.transform.setPosition(0, 0, 0);

  const floorMr = floor.addComponent(MeshRenderer);
  floorMr.init(gpu.device, pipeline, planeMesh, floorMat);

  const floorRb = floor.addComponent(RigidBody);
  floorRb.init(physicsWorld, { type: 'fixed' });
  floor.addComponent(Collider).init(physicsWorld, {
    shape: { type: 'box', halfExtents: { x: 10, y: 0.01, z: 10 } },
  });
  scene.add(floor);

  // --- Falling cubes ---
  for (let i = 0; i < 10; i++) {
    const color = CUBE_COLORS[i]!;
    const mat = createMaterial({ albedo: color, metallic: 0.3, roughness: 0.5 });

    const cube = new GameObject(`Cube_${i}`);
    const x = (i % 5) * 1.2 - 2.4;
    const y = 3 + i * 1.5;
    const z = i < 5 ? -0.5 : 0.5;
    cube.transform.setPosition(x, y, z);

    const mr = cube.addComponent(MeshRenderer);
    mr.init(gpu.device, pipeline, cubeMesh, mat);

    const rb = cube.addComponent(RigidBody);
    rb.init(physicsWorld, { type: 'dynamic' });
    cube.addComponent(Collider).init(physicsWorld, {
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      restitution: 0.3,
    });

    scene.add(cube);
  }

  // Light & camera
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.0);
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 0, 8, 16);
  Vec3.set(camera.target, 0, 2, 0);

  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);
  const physicsSystem = new PhysicsSystem(physicsWorld, scene);

  // FPS counter
  const fpsEl = document.getElementById('fps')!;
  let frames = 0;
  let lastTime = performance.now();
  function updateFps() {
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      fpsEl.textContent = `${frames} FPS`;
      frames = 0;
      lastTime = now;
    }
    requestAnimationFrame(updateFps);
  }
  requestAnimationFrame(updateFps);

  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.setPhysics(physicsSystem);
  engine.input.attach(window);
  engine.start(scene);
}

main().catch(console.error);
