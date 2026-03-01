import { Engine, Scene, GameObject } from '@certe/atmos-core';
import {
  initWebGPU,
  createRenderPipeline,
  createCubeGeometry,
  createSphereGeometry,
  createMesh,
  createMaterial,
  createDirectionalLight,
  MeshRenderer,
  RenderSystem,
  createDefaultCamera,
} from '@certe/atmos-renderer';
import { ParticleEmitter, ParticleRenderer } from '@certe/atmos-particles';
import { FireEffect } from './fire-effect.js';
import { SparkEffect } from './spark-effect.js';
import { DustEffect } from './dust-effect.js';

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  const light = createDirectionalLight();
  const camera = createDefaultCamera();
  camera.eye[0] = 0;
  camera.eye[1] = 4;
  camera.eye[2] = 10;
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  const cubeGeo = createCubeGeometry();
  const sphereGeo = createSphereGeometry();

  // --- Floor ---
  const floor = new GameObject('Floor');
  floor.transform.setPosition(0, -0.5, 0);
  floor.transform.setScale(12, 0.1, 12);
  const floorMR = floor.addComponent(MeshRenderer);
  floorMR.init(renderSystem,
    createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices),
    createMaterial({ albedo: [0.15, 0.15, 0.18, 1], metallic: 0, roughness: 0.9 }));
  scene.add(floor);

  // --- Fire emitter (center) ---
  const fireGO = new GameObject('Fire');
  fireGO.transform.setPosition(0, 0, 0);
  const fireMR = fireGO.addComponent(MeshRenderer);
  fireMR.init(renderSystem,
    createMesh(gpu.device, sphereGeo.vertices, sphereGeo.indices),
    createMaterial({ albedo: [0.3, 0.1, 0.0, 1], metallic: 0, roughness: 1, emissive: [1, 0.3, 0], emissiveIntensity: 2 }));
  const fireEmitter = fireGO.addComponent(ParticleEmitter);
  fireEmitter.maxParticles = 300;
  const firePR = fireGO.addComponent(ParticleRenderer);
  firePR.additive = true;
  firePR.init(renderSystem);
  fireGO.addComponent(FireEffect);
  scene.add(fireGO);

  // --- Sparks emitter (right) ---
  const sparksGO = new GameObject('Sparks');
  sparksGO.transform.setPosition(3, 0, 0);
  const sparksMR = sparksGO.addComponent(MeshRenderer);
  sparksMR.init(renderSystem,
    createMesh(gpu.device, sphereGeo.vertices, sphereGeo.indices),
    createMaterial({ albedo: [0.2, 0.2, 0.2, 1], metallic: 0.8, roughness: 0.3 }));
  const sparksEmitter = sparksGO.addComponent(ParticleEmitter);
  sparksEmitter.maxParticles = 200;
  const sparksPR = sparksGO.addComponent(ParticleRenderer);
  sparksPR.additive = true;
  sparksPR.init(renderSystem);
  sparksGO.addComponent(SparkEffect);
  scene.add(sparksGO);

  // --- Ambient dust (left, slow) ---
  const dustGO = new GameObject('Dust');
  dustGO.transform.setPosition(-3, 0, 0);
  const dustMR = dustGO.addComponent(MeshRenderer);
  dustMR.init(renderSystem,
    createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices),
    createMaterial({ albedo: [0.3, 0.3, 0.35, 1], metallic: 0, roughness: 0.8 }));
  dustGO.transform.setScale(0.3, 0.3, 0.3);
  const dustEmitter = dustGO.addComponent(ParticleEmitter);
  dustEmitter.maxParticles = 100;
  const dustPR = dustGO.addComponent(ParticleRenderer);
  dustPR.additive = false;
  dustPR.init(renderSystem);
  dustGO.addComponent(DustEffect);
  scene.add(dustGO);

  // --- Engine ---
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.input.attach(window);
  engine.start(scene);
}

main().catch(console.error);
