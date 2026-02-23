import { Scene } from './scene.js';
import { Time } from './time.js';
import { Input } from './input.js';

export interface Renderer {
  beginFrame(): void;
  endFrame(): void;
}

export interface PhysicsStepper {
  step(dt: number): void;
}

export class Engine {
  readonly time = new Time();
  readonly input = new Input();

  private _scene: Scene | null = null;
  private _renderer: Renderer | null = null;
  private _physics: PhysicsStepper | null = null;
  private _running = false;
  private _paused = false;
  private _rafId = 0;

  setRenderer(renderer: Renderer): void {
    this._renderer = renderer;
  }

  setPhysics(physics: PhysicsStepper): void {
    this._physics = physics;
  }

  start(scene: Scene): void {
    if (this._running) return;
    this._scene = scene;
    Scene.current = scene;
    this._running = true;
    this.time.reset();

    if (!this._paused) {
      scene.awakeAll();
      scene.startAll();
    }

    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
  }

  stop(): void {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  get running(): boolean {
    return this._running;
  }

  get paused(): boolean {
    return this._paused;
  }

  set paused(value: boolean) {
    this._paused = value;
  }

  set scene(s: Scene) {
    this._scene = s;
    Scene.current = s;
  }

  /** Exposed for testing: run a single frame tick manually */
  tick(timestamp: number): void {
    if (!this._scene) return;
    this.time.update(timestamp);
    this.input.endFrame();
    if (!this._paused) {
      this._physics?.step(this.time.deltaTime);
      this._scene.updateAll(this.time.deltaTime);
    }
    this._renderer?.beginFrame();
    this._scene.renderAll();
    this._renderer?.endFrame();
  }

  private _loop(timestamp: number): void {
    if (!this._running) return;
    this.tick(timestamp);
    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
  }
}
