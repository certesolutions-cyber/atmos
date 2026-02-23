import { Engine, Scene, GameObject } from '@atmos/core';
import { Vec3 } from '@atmos/math';
import {
  initWebGPU,
  createRenderPipeline,
  createDirectionalLight,
  createMesh,
  createMaterial,
  createCubeGeometry,
  MeshRenderer,
  RenderSystem,
  createDefaultCamera,
} from '@atmos/renderer';
import { parseGltfModel, instantiateModel } from '@atmos/assets';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  // Light & camera
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.5);
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 0, 2, 5);
  Vec3.set(camera.target, 0, 0.5, 0);

  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // Add a ground plane placeholder
  const ground = new GameObject('Ground');
  const cubeGeo = createCubeGeometry();
  const groundMesh = createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices);
  const groundMat = createMaterial({ albedo: [0.3, 0.3, 0.3, 1], metallic: 0, roughness: 0.9 });
  const groundMr = ground.addComponent(MeshRenderer);
  groundMr.init(renderSystem, groundMesh, groundMat);
  ground.transform.setPosition(0, -0.5, 0);
  ground.transform.setScale(10, 0.02, 10);
  scene.add(ground);

  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.input.attach(window);
  engine.start(scene);

  // Simple orbit camera
  let theta = 0;
  let phi = 0.3;
  let dist = 5;
  canvas.addEventListener('wheel', (e) => {
    dist = Math.max(1, dist + e.deltaY * 0.01);
    updateCamera();
  });
  let dragging = false;
  canvas.addEventListener('mousedown', () => { dragging = true; });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    theta -= e.movementX * 0.005;
    phi = Math.max(-1.5, Math.min(1.5, phi + e.movementY * 0.005));
    updateCamera();
  });

  function updateCamera() {
    const x = dist * Math.cos(phi) * Math.sin(theta);
    const y = dist * Math.sin(phi) + 1;
    const z = dist * Math.cos(phi) * Math.cos(theta);
    Vec3.set(camera.eye, x, y, z);
    Vec3.set(camera.target, 0, 0.5, 0);
  }

  // Model loading
  const statusEl = document.getElementById('status')!;

  async function loadGlb(buffer: ArrayBuffer, name: string) {
    statusEl.textContent = `Loading ${name}...`;
    try {
      const asset = parseGltfModel(buffer, name);
      const root = await instantiateModel(asset, { renderSystem });
      scene.add(root);
      statusEl.textContent = `Loaded: ${name} (${asset.meshes.length} mesh${asset.meshes.length > 1 ? 'es' : ''})`;
    } catch (err) {
      statusEl.textContent = `Error: ${err}`;
      console.error(err);
    }
  }

  // File input
  const loadBtn = document.getElementById('load-btn')!;
  loadBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await loadGlb(buffer, file.name);
    };
    input.click();
  });

  // Drag & drop
  const dropZone = document.getElementById('drop-zone')!;
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
  });
  document.addEventListener('dragleave', () => {
    dropZone.classList.remove('active');
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await loadGlb(buffer, file.name);
  });
}

main().catch(console.error);
