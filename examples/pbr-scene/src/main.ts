import { Engine, Scene, GameObject } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import {
  initWebGPU,
  createRenderPipeline,
  createCubeGeometry,
  createSphereGeometry,
  createCylinderGeometry,
  createPlaneGeometry,
  createMesh,
  createMaterial,
  createDirectionalLight,
  MeshRenderer,
  RenderSystem,
  createDefaultCamera,
} from '@atmos/renderer';
import type { Mesh, Material } from '@atmos/renderer';
import { RandomRotator } from './random-rotator.js';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  // Light, camera, render system
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.0);
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 0, 10, 18);
  Vec3.set(camera.target, 0, 0, 0);
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // Shared meshes
  const geo = {
    cube: createCubeGeometry(),
    sphere: createSphereGeometry(),
    cylinder: createCylinderGeometry(),
    plane: createPlaneGeometry(0.8, 0.8),
  };
  const meshes: Mesh[] = [
    createMesh(gpu.device, geo.cube.vertices, geo.cube.indices),
    createMesh(gpu.device, geo.sphere.vertices, geo.sphere.indices),
    createMesh(gpu.device, geo.cylinder.vertices, geo.cylinder.indices),
    createMesh(gpu.device, geo.plane.vertices, geo.plane.indices),
  ];

  // Shared materials
  const materials: Material[] = [
    createMaterial({ albedo: [1.0, 0.2, 0.2, 1], metallic: 0.1, roughness: 0.6 }),
    createMaterial({ albedo: [0.2, 0.8, 0.3, 1], metallic: 0.0, roughness: 0.8 }),
    createMaterial({ albedo: [0.3, 0.3, 1.0, 1], metallic: 0.7, roughness: 0.2 }),
    createMaterial({ albedo: [0.9, 0.9, 0.9, 1], metallic: 1.0, roughness: 0.1 }),
    createMaterial({ albedo: [1.0, 0.7, 0.2, 1], metallic: 0.9, roughness: 0.3 }),
  ];

  // 10×10 grid of objects
  const GRID = 10;
  const SPACING = 1.5;
  const offsetX = ((GRID - 1) * SPACING) / 2;
  const offsetZ = ((GRID - 1) * SPACING) / 2;

  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) {
      const idx = iz * GRID + ix;
      const obj = new GameObject(`Obj_${idx}`);

      const x = ix * SPACING - offsetX;
      const z = iz * SPACING - offsetZ;
      obj.transform.setPosition(x, 0, z);

      const meshIdx = idx % meshes.length;
      const matIdx = idx % materials.length;

      const mr = obj.addComponent(MeshRenderer);
      mr.init(renderSystem, meshes[meshIdx]!, materials[matIdx]!);

      obj.addComponent(RandomRotator);
      scene.add(obj);
    }
  }

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
  engine.input.attach(window);
  engine.start(scene);
}

main().catch(console.error);
