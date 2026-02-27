import { Engine, Scene, GameObject } from '@certe/atmos-core';
import { Vec3 } from '@certe/atmos-math';
import {
  initWebGPU,
  createRenderPipeline,
  createPlaneGeometry,
  createSphereGeometry,
  createMesh,
  createMaterial,
  createDirectionalLight,
  MeshRenderer,
  RenderSystem,
  createDefaultCamera,
} from '@certe/atmos-renderer';
import {
  initRapier,
  PhysicsWorld,
  PhysicsSystem,
  RigidBody,
  Collider,
} from '@certe/atmos-physics';
import { BallDropper } from './BallDropper.js';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const [gpu, RAPIER] = await Promise.all([initWebGPU(canvas), initRapier()]);
  void RAPIER;

  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  // Camera + light
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 0, 10, 18);
  Vec3.set(camera.target, 0, 2, 0);
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.0);
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // Physics world
  const physicsWorld = new PhysicsWorld({ gravity: { x: 0, y: -9.81, z: 0 } });

  // --- Floor (manual init — the traditional way) ---
  const floorGeo = createPlaneGeometry(20, 20);
  const floorMesh = createMesh(gpu.device, floorGeo.vertices, floorGeo.indices);
  const floorMat = createMaterial({ albedo: [0.35, 0.35, 0.4, 1], metallic: 0.0, roughness: 0.9 });

  const floor = new GameObject('Floor');
  floor.transform.setPosition(0, 0, 0);
  floor.addComponent(MeshRenderer).init(renderSystem, floorMesh, floorMat);
  floor.addComponent(RigidBody).init(physicsWorld, { type: 'fixed' });
  floor.addComponent(Collider).init(physicsWorld, {
    shape: { type: 'box', halfExtents: { x: 10, y: 0.01, z: 10 } },
  });
  scene.add(floor);

  // --- BallDropper script (uses auto-init for runtime spawning) ---
  const sphereGeo = createSphereGeometry(0.5, 16, 12);
  const sphereMesh = createMesh(gpu.device, sphereGeo.vertices, sphereGeo.indices);

  const spawner = new GameObject('BallDropper');
  const dropper = spawner.addComponent(BallDropper);
  dropper.renderSystem = renderSystem;
  dropper.sphereMesh = sphereMesh;
  scene.add(spawner);

  // Physics + engine
  const physicsSystem = new PhysicsSystem(physicsWorld, scene);

  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.setPhysics(physicsSystem);
  engine.input.attach(window);
  engine.start(scene);

  // Info overlay
  const info = document.getElementById('info')!;
  setInterval(() => {
    const count = scene.getAllObjects().filter(o => o.name.startsWith('Ball_')).length;
    info.textContent = `Click to drop balls (${count}/50)`;
  }, 200);
}

main().catch(console.error);
