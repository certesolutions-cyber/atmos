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
  parseCustomShader,
} from '@certe/atmos-renderer';
import { Vec3 } from '@certe/atmos-math';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  const light = createDirectionalLight();
  const camera = createDefaultCamera();
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  // Set up a shader loader that fetches .wgsl files from the dev server
  renderSystem.setShaderLoader(async (path: string) => {
    const resp = await fetch(`/${path}`);
    if (!resp.ok) throw new Error(`Failed to load shader: ${path}`);
    return resp.text();
  });

  // ── Object 1: Cube with custom green shader ──
  const cube = new GameObject('CustomCube');
  const cubeGeo = createCubeGeometry();
  const cubeMesh = createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices);
  const cubeMat = createMaterial();
  cubeMat.shaderType = 'custom';
  cubeMat.customShaderPath = 'shaders/test-color.wgsl';
  // Default baseColor is green (0, 1, 0, 1) from the shader

  const cubeMr = cube.addComponent(MeshRenderer);
  cubeMr.init(renderSystem, cubeMesh, cubeMat);
  Vec3.set(cube.transform.position, -1.5, 0, 0);
  scene.add(cube);

  // ── Object 2: Sphere with PBR (reference) ──
  const sphere = new GameObject('PBRSphere');
  const sphereGeo = createSphereGeometry(0.8, 32, 24);
  const sphereMesh = createMesh(gpu.device, sphereGeo.vertices, sphereGeo.indices);
  const sphereMat = createMaterial({
    albedo: [1, 0, 0, 1],
    metallic: 0.3,
    roughness: 0.5,
  });

  const sphereMr = sphere.addComponent(MeshRenderer);
  sphereMr.init(renderSystem, sphereMesh, sphereMat);
  Vec3.set(sphere.transform.position, 1.5, 0, 0);
  scene.add(sphere);

  // Create and start engine
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.input.attach(window);
  engine.start(scene);

  // Signal to puppeteer that the scene is ready after a few frames
  let frameCount = 0;
  const checkReady = () => {
    frameCount++;
    if (frameCount >= 10) {
      (window as unknown as Record<string, boolean>).__ATMOS_READY__ = true;
    } else {
      requestAnimationFrame(checkReady);
    }
  };
  requestAnimationFrame(checkReady);
}

main().catch((err) => {
  console.error(err);
  document.body.style.background = '#111';
  document.body.style.color = '#f88';
  document.body.style.padding = '2em';
  document.body.style.fontFamily = 'monospace';
  document.body.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
});
