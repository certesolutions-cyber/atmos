import { Engine, Scene, GameObject } from '@certe/atmos-core';
import { Vec3 } from '@certe/atmos-math';
import {
  initWebGPU,
  createRenderPipeline,
  createDirectionalLight,
  RenderSystem,
  createDefaultCamera,
} from '@certe/atmos-renderer';
import {
  initRapier,
  PhysicsWorld,
  PhysicsSystem,
} from '@certe/atmos-physics';
import { Floor } from './Floor.js';
import { BallDropper } from './BallDropper.js';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const [gpu] = await Promise.all([initWebGPU(canvas), initRapier()]);

  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  // Camera + light
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 0, 10, 18);
  Vec3.set(camera.target, 0, 2, 0);
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.0);
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // Physics
  const physicsWorld = new PhysicsWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
  const physicsSystem = new PhysicsSystem(physicsWorld, scene);

  // Scene objects — all logic lives in component scripts
  const floor = new GameObject('Floor');
  floor.addComponent(Floor);
  scene.add(floor);

  const spawner = new GameObject('BallDropper');
  spawner.addComponent(BallDropper);
  scene.add(spawner);

  // Start engine
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.setPhysics(physicsSystem);
  engine.input.attach(window);
  engine.start(scene);

  // Info overlay
  const info = document.getElementById('info')!;
  setInterval(() => {
    let count = 0;
    for (const o of scene.getAllObjects()) if (o.name.startsWith('Ball_')) count++;
    info.textContent = `Click to drop balls (${count}/${50})`;
  }, 200);
}

main().catch(console.error);
