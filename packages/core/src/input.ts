export interface EventTarget {
  addEventListener: (type: string, handler: (e: unknown) => void) => void;
  removeEventListener: (type: string, handler: (e: unknown) => void) => void;
}

export class Input {
  private readonly _keysDown: Set<string> = new Set();
  private readonly _keysPressed: Set<string> = new Set();
  private readonly _keysJustDown: Set<string> = new Set();
  private _detach: (() => void) | null = null;

  /** Call to bind keyboard listeners to a target (e.g., window). Returns detach function. */
  attach(target: EventTarget): () => void {
    this.detach();

    const onKeyDown = (e: unknown) => {
      const key = (e as KeyboardEvent).code;
      if (!this._keysDown.has(key)) {
        this._keysJustDown.add(key);
      }
      this._keysDown.add(key);
      this._keysPressed.add(key);
    };
    const onKeyUp = (e: unknown) => {
      const key = (e as KeyboardEvent).code;
      this._keysDown.delete(key);
      this._keysPressed.delete(key);
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);

    this._detach = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      this._detach = null;
    };
    return this._detach;
  }

  /** Remove previously attached listeners */
  detach(): void {
    this._detach?.();
  }

  /** True while key is held */
  getKey(code: string): boolean {
    return this._keysDown.has(code);
  }

  /** True only on the frame the key was first pressed */
  getKeyDown(code: string): boolean {
    return this._keysJustDown.has(code);
  }

  /** Call at the end of each frame to reset per-frame state */
  endFrame(): void {
    this._keysJustDown.clear();
  }
}
