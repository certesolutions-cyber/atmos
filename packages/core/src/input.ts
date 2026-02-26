export interface EventTarget {
  addEventListener: (type: string, handler: (e: unknown) => void) => void;
  removeEventListener: (type: string, handler: (e: unknown) => void) => void;
}

export interface CanvasLike {
  getBoundingClientRect(): { left: number; top: number };
  addEventListener: (type: string, handler: (e: unknown) => void) => void;
  removeEventListener: (type: string, handler: (e: unknown) => void) => void;
}

export class Input {
  /** The currently active Input instance, set automatically by Engine. */
  static current: Input | null = null;

  private readonly _keysDown: Set<string> = new Set();
  private readonly _keysPressed: Set<string> = new Set();
  private readonly _keysJustDown: Set<string> = new Set();
  private readonly _keysJustUp: Set<string> = new Set();
  private _detach: (() => void) | null = null;

  /** Canvas-relative mouse position in CSS pixels. Updated on mousemove. */
  readonly mousePosition = { x: 0, y: 0 };

  /** Bind keyboard listeners to a target (e.g., window). Optionally bind mouse to a canvas. */
  attach(target: EventTarget, canvas?: CanvasLike): () => void {
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
      this._keysJustUp.add(key);
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);

    let onMouseMove: ((e: unknown) => void) | null = null;
    if (canvas) {
      onMouseMove = (e: unknown) => {
        const me = e as MouseEvent;
        const rect = canvas.getBoundingClientRect();
        this.mousePosition.x = me.clientX - rect.left;
        this.mousePosition.y = me.clientY - rect.top;
      };
      canvas.addEventListener('mousemove', onMouseMove);
    }

    this._detach = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      if (canvas && onMouseMove) {
        canvas.removeEventListener('mousemove', onMouseMove);
      }
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

  /** True only on the frame the key was released */
  getKeyUp(code: string): boolean {
    return this._keysJustUp.has(code);
  }

  /** Call at the end of each frame to reset per-frame state */
  endFrame(): void {
    this._keysJustDown.clear();
    this._keysJustUp.clear();
  }
}
