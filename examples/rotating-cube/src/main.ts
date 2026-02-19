import { Engine, Scene, GameObject } from '@atmos/core';
import {
  initWebGPU,
  createRenderPipeline,
  createCubeGeometry,
  createMesh,
  createMaterial,
  createDirectionalLight,
  MeshRenderer,
  RenderSystem,
  createDefaultCamera,
} from '@atmos/renderer';
import { Rotator } from './rotator.js';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  // Init WebGPU
  const gpu = await initWebGPU(canvas);
  const pipelineResources = createRenderPipeline(gpu.device, gpu.format);

  // Create scene
  const scene = new Scene();

  // Create material & light
  const material = createMaterial({
    albedo: [1, 0.2, 0.2, 1],
    metallic: 0.3,
    roughness: 0.5,
  });
  const light = createDirectionalLight();

  // Create cube
  const cube = new GameObject('Cube');
  const geometry = createCubeGeometry();
  const mesh = createMesh(gpu.device, geometry.vertices, geometry.indices);

  const meshRenderer = cube.addComponent(MeshRenderer);
  meshRenderer.init(gpu.device, pipelineResources, mesh, material);

  cube.addComponent(Rotator);
  scene.add(cube);

  // Create render system
  const camera = createDefaultCamera();
  const renderSystem = new RenderSystem(gpu, pipelineResources, scene, camera, light);

  // Create and start engine
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.input.attach(window);
  engine.start(scene);
}

main().catch(console.error);
