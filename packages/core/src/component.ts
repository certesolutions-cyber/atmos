import type { GameObject } from './game-object.js';

export abstract class Component {
  gameObject!: GameObject;
  enabled = true;

  onAwake?(): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onRender?(): void;
  onDestroy?(): void;
}
