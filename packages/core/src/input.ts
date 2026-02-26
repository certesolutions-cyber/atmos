export interface EventTarget {
  addEventListener: (type: string, handler: (e: unknown) => void, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, handler: (e: unknown) => void, options?: boolean | EventListenerOptions) => void;
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
  private readonly _keysJustDown: Set<string> = new Set();
  private readonly _keysJustUp: Set<string> = new Set();
  private _mouseButtons = 0;
  private _detach: (() => void) | null = null;

  /** Canvas-relative mouse position in CSS pixels. Updated on mousemove. */
  readonly mousePosition = { x: 0, y: 0 };

  /** Accumulated mouse movement since last endFrame(). */
  readonly mouseDelta = { x: 0, y: 0 };

  /** Bind keyboard + mouse listeners to a target (e.g., window). Optionally bind mouse position to a canvas. */
  attach(target: EventTarget, canvas?: CanvasLike): () => void {
    this.detach();

    const onKeyDown = (e: unknown) => {
      const key = (e as KeyboardEvent).code;
      if (!this._keysDown.has(key)) {
        this._keysJustDown.add(key);
      }
      this._keysDown.add(key);
    };
    const onKeyUp = (e: unknown) => {
      const key = (e as KeyboardEvent).code;
      this._keysDown.delete(key);
      this._keysJustUp.add(key);
    };

    const onMouseMove = (e: unknown) => {
      const me = e as MouseEvent;
      this.mouseDelta.x += me.movementX;
      this.mouseDelta.y += me.movementY;
      this._mouseButtons = me.buttons;
    };

    const onMouseDown = (e: unknown) => {
      this._mouseButtons = (e as MouseEvent).buttons;
    };
    const onMouseUp = (e: unknown) => {
      this._mouseButtons = (e as MouseEvent).buttons;
    };

    // Use capture phase so events are received before any focused element
    // (e.g. <select>) can consume or stop propagation of keyboard events.
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('keyup', onKeyUp, true);
    target.addEventListener('mousemove', onMouseMove);
    target.addEventListener('mousedown', onMouseDown);
    target.addEventListener('mouseup', onMouseUp);

    let onCanvasMouseMove: ((e: unknown) => void) | null = null;
    if (canvas) {
      onCanvasMouseMove = (e: unknown) => {
        const me = e as MouseEvent;
        const rect = canvas.getBoundingClientRect();
        this.mousePosition.x = me.clientX - rect.left;
        this.mousePosition.y = me.clientY - rect.top;
      };
      canvas.addEventListener('mousemove', onCanvasMouseMove);
    }

    this._detach = () => {
      target.removeEventListener('keydown', onKeyDown, true);
      target.removeEventListener('keyup', onKeyUp, true);
      target.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      if (canvas && onCanvasMouseMove) {
        canvas.removeEventListener('mousemove', onCanvasMouseMove);
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

  /** True only on the frame the key was first pressed (alias for getKeyDown). */
  getKeyPressed(code: string): boolean {
    return this._keysJustDown.has(code);
  }

  /** True only on the frame the key was released */
  getKeyUp(code: string): boolean {
    return this._keysJustUp.has(code);
  }

  /** True while mouse button is held (0=left, 1=middle, 2=right). */
  getMouseButton(button: number): boolean {
    return (this._mouseButtons & (1 << button)) !== 0;
  }

  /** Call at the end of each frame to reset per-frame state */
  endFrame(): void {
    this._keysJustDown.clear();
    this._keysJustUp.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }
}
