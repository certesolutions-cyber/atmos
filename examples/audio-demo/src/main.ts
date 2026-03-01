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
import { AudioListener, AudioSource, resumeAudioContext } from '@certe/atmos-audio';
import { ToneEmitter } from './tone-emitter.js';
import { Orbiter } from './orbiter.js';

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const gpu = await initWebGPU(canvas);
  const pipeline = createRenderPipeline(gpu.device, gpu.format);
  const scene = new Scene();

  const light = createDirectionalLight();
  const camera = createDefaultCamera();
  camera.eye[0] = 0;
  camera.eye[1] = 8;
  camera.eye[2] = 12;
  const renderSystem = new RenderSystem(gpu, pipeline, scene, camera, light);

  const cubeGeo = createCubeGeometry();
  const sphereGeo = createSphereGeometry();

  // --- Listener: attach to a "player" at origin ---
  const listenerGO = new GameObject('Listener');
  listenerGO.addComponent(AudioListener);
  scene.add(listenerGO);

  // --- Red cube: orbiting sine 440 Hz ---
  const sineGO = new GameObject('Sine Orbiter');
  const sineMR = sineGO.addComponent(MeshRenderer);
  sineMR.init(renderSystem,
    createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices),
    createMaterial({ albedo: [1, 0.2, 0.2, 1], metallic: 0.1, roughness: 0.7 }));

  const sineOrbit = sineGO.addComponent(Orbiter);
  sineOrbit.radius = 6;
  sineOrbit.speed = 0.8;

  const sineSource = sineGO.addComponent(AudioSource);
  sineSource.loop = true;
  sineSource.autoplay = true;
  sineSource.volume = 0.6;
  sineSource.refDistance = 2;
  sineSource.maxDistance = 20;

  const sineTone = sineGO.addComponent(ToneEmitter);
  sineTone.waveform = 'sine';
  sineTone.frequency = 440;
  sineTone.duration = 2;

  scene.add(sineGO);

  // --- Green cube: static square 220 Hz ---
  const squareGO = new GameObject('Square Static');
  squareGO.transform.setPosition(-4, 0, -3);
  const squareMR = squareGO.addComponent(MeshRenderer);
  squareMR.init(renderSystem,
    createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices),
    createMaterial({ albedo: [0.2, 1, 0.2, 1], metallic: 0.3, roughness: 0.5 }));

  const squareSource = squareGO.addComponent(AudioSource);
  squareSource.loop = true;
  squareSource.autoplay = true;
  squareSource.volume = 0.4;
  squareSource.refDistance = 1.5;
  squareSource.maxDistance = 15;

  const squareTone = squareGO.addComponent(ToneEmitter);
  squareTone.waveform = 'square';
  squareTone.frequency = 220;
  squareTone.duration = 2;
  squareTone.amplitude = 0.3;

  scene.add(squareGO);

  // --- Blue sphere: orbiting noise burst ---
  const noiseGO = new GameObject('Noise Orbiter');
  const noiseMR = noiseGO.addComponent(MeshRenderer);
  noiseMR.init(renderSystem,
    createMesh(gpu.device, sphereGeo.vertices, sphereGeo.indices),
    createMaterial({ albedo: [0.2, 0.3, 1, 1], metallic: 0.6, roughness: 0.3 }));

  const noiseOrbit = noiseGO.addComponent(Orbiter);
  noiseOrbit.radius = 8;
  noiseOrbit.speed = -0.5;
  noiseOrbit.height = 2;

  const noiseSource = noiseGO.addComponent(AudioSource);
  noiseSource.loop = true;
  noiseSource.autoplay = true;
  noiseSource.volume = 0.3;
  noiseSource.refDistance = 2;
  noiseSource.maxDistance = 25;

  const noiseTone = noiseGO.addComponent(ToneEmitter);
  noiseTone.waveform = 'noise';
  noiseTone.duration = 1;
  noiseTone.amplitude = 0.3;

  scene.add(noiseGO);

  // --- Floor (visual only) ---
  const floor = new GameObject('Floor');
  floor.transform.setPosition(0, -1, 0);
  floor.transform.setScale(10, 0.1, 10);
  const floorMR = floor.addComponent(MeshRenderer);
  floorMR.init(renderSystem,
    createMesh(gpu.device, cubeGeo.vertices, cubeGeo.indices),
    createMaterial({ albedo: [0.3, 0.3, 0.3, 1], metallic: 0, roughness: 0.9 }));
  scene.add(floor);

  // --- Engine: handles all lifecycle (awake → start → update → render) ---
  const engine = new Engine();
  engine.setRenderer(renderSystem);
  engine.input.attach(window);

  // Wait for user gesture before starting (browser autoplay policy)
  const overlay = document.getElementById('overlay')!;
  overlay.addEventListener('click', async () => {
    await resumeAudioContext();
    engine.start(scene);
    overlay.style.display = 'none';
    updateStatus('Playing — 3 spatial audio sources');
  });

  setupControls(sineSource, squareSource, noiseSource);
}

function setupControls(
  sine: AudioSource,
  square: AudioSource,
  noise: AudioSource,
): void {
  document.getElementById('master-vol')?.addEventListener('input', (e) => {
    const listeners = AudioListener.findAll(AudioListener);
    if (listeners[0]) {
      listeners[0].masterVolume = parseFloat((e.target as HTMLInputElement).value);
    }
  });

  document.getElementById('sine-vol')?.addEventListener('input', (e) => {
    sine.volume = parseFloat((e.target as HTMLInputElement).value);
  });

  document.getElementById('square-vol')?.addEventListener('input', (e) => {
    square.volume = parseFloat((e.target as HTMLInputElement).value);
  });

  document.getElementById('noise-vol')?.addEventListener('input', (e) => {
    noise.volume = parseFloat((e.target as HTMLInputElement).value);
  });

  document.getElementById('toggle-sine')?.addEventListener('click', () => {
    sine.playing ? sine.stop() : sine.play();
    updateStatus(`Sine: ${sine.playing ? 'playing' : 'stopped'}`);
  });

  document.getElementById('toggle-square')?.addEventListener('click', () => {
    square.playing ? square.stop() : square.play();
    updateStatus(`Square: ${square.playing ? 'playing' : 'stopped'}`);
  });

  document.getElementById('toggle-noise')?.addEventListener('click', () => {
    noise.playing ? noise.stop() : noise.play();
    updateStatus(`Noise: ${noise.playing ? 'playing' : 'stopped'}`);
  });
}

function updateStatus(text: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

main().catch(console.error);
