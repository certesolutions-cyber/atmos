import { Engine, Scene, GameObject, registerCoreBuiltins } from '@atmos/core';
import { Vec3, Quat } from '@atmos/math';
import {
  initWebGPU,
  createRenderPipeline,
  createDirectionalLight,
  createMesh,
  createMaterial,
  createCubeGeometry,
  MeshRenderer,
  DirectionalLight,
  RenderSystem,
  createDefaultCamera,
  registerRendererBuiltins,
} from '@atmos/renderer';
import { parseGltfModel, instantiateModel } from '@atmos/assets';
import { registerAnimationBuiltins } from '@atmos/animation';

async function main() {
  registerCoreBuiltins();
  registerRendererBuiltins();
  registerAnimationBuiltins();

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  // Light & camera
  const light = createDirectionalLight([-0.5, -1.0, -0.3], [1, 1, 1], 1.5);
  const camera = createDefaultCamera();
  Vec3.set(camera.eye, 0, 2, 5);
  Vec3.set(camera.target, 0, 1, 0);

  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // Ground plane
  const ground = new GameObject('Ground');
  const cubeGeo = createCubeGeometry();
  const groundMesh = createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices);
  const groundMat = createMaterial({ albedo: [0.25, 0.25, 0.25, 1], metallic: 0, roughness: 0.9 });
  const groundMr = ground.addComponent(MeshRenderer);
  groundMr.init(renderSystem, groundMesh, groundMat);
  ground.transform.setPosition(0, -0.01, 0);
  ground.transform.setScale(10, 0.02, 10);
  scene.add(ground);

  // Directional light with shadows
  const lightGo = new GameObject('DirectionalLight');
  const dl = lightGo.addComponent(DirectionalLight);
  dl.color.set([1, 1, 1]);
  dl.intensity = 1.5;
  dl.castShadows = true;
  dl.shadowIntensity = 0.8;
  dl.shadowSize = 10;
  dl.shadowDistance = 30;
  dl.shadowFarSize = 40;
  dl.shadowFarDistance = 80;
  // Rotate so light shines down and slightly forward (-Z becomes the light direction)
  const deg = Math.PI / 180;
  const q = Quat.create();
  Quat.fromEuler(q, -50 * deg, -30 * deg, 0);
  lightGo.transform.setRotationFrom(q);
  scene.add(lightGo);

  // Engine
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.input.attach(window);
  engine.start(scene);

  // Orbit camera
  let theta = 0;
  let phi = 0.3;
  let dist = 5;
  const updateCamera = () => {
    const x = dist * Math.cos(phi) * Math.sin(theta);
    const y = dist * Math.sin(phi) + 1;
    const z = dist * Math.cos(phi) * Math.cos(theta);
    Vec3.set(camera.eye, x, y, z);
    Vec3.set(camera.target, 0, 1, 0);
  };
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

  // Status UI
  const statusEl = document.getElementById('status')!;

  // Load a .glb (skinning + animation auto-detected by instantiateModel)
  async function loadGlb(buffer: ArrayBuffer, name: string) {
    statusEl.textContent = `Loading ${name}...`;
    try {
      const asset = parseGltfModel(buffer, name);
      const root = await instantiateModel(asset, { renderSystem });
      scene.add(root);

      const parts: string[] = [`${asset.meshes.length} mesh(es)`];
      if (asset.skins.length > 0) parts.push(`${asset.skins.length} skin(s)`);
      if (asset.animations.length > 0) parts.push(`${asset.animations.length} animation(s)`);
      statusEl.textContent = `${name}: ${parts.join(', ')}`;
    } catch (err) {
      statusEl.textContent = `Error: ${err}`;
      console.error(err);
    }
  }

  // Load button
  document.getElementById('load-btn')!.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await loadGlb(await file.arrayBuffer(), file.name);
    };
    input.click();
  });

  // Try auto-loading model.glb from models/ folder
  try {
    const res = await fetch('/models/model.glb');
    if (res.ok) {
      await loadGlb(await res.arrayBuffer(), 'model.glb');
    }
  } catch { /* no auto-load model */ }
}

main().catch(console.error);
