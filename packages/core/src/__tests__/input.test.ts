import { describe, it, expect, beforeEach } from 'vitest';
import { Input } from '../input.js';
import type { EventTarget as InputTarget, CanvasLike } from '../input.js';

/** Minimal mock that stores listeners for manual dispatch. */
function createMockTarget(): InputTarget & { fire(type: string, event: unknown): void } {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener(type: string, handler: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: (e: unknown) => void) {
      listeners.get(type)?.delete(handler);
    },
    fire(type: string, event: unknown) {
      for (const h of listeners.get(type) ?? []) h(event);
    },
  };
}

function createMockCanvas(): CanvasLike & { fire(type: string, event: unknown): void } {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    addEventListener(type: string, handler: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: (e: unknown) => void) {
      listeners.get(type)?.delete(handler);
    },
    fire(type: string, event: unknown) {
      for (const h of listeners.get(type) ?? []) h(event);
    },
  };
}

function keyEvent(code: string): unknown {
  return { code };
}

describe('Input', () => {
  let input: Input;
  let target: ReturnType<typeof createMockTarget>;

  beforeEach(() => {
    input = new Input();
    target = createMockTarget();
    input.attach(target);
  });

  // --- getKey ---

  it('getKey returns true while key is held', () => {
    target.fire('keydown', keyEvent('KeyA'));
    expect(input.getKey('KeyA')).toBe(true);
  });

  it('getKey returns false after key is released', () => {
    target.fire('keydown', keyEvent('KeyA'));
    target.fire('keyup', keyEvent('KeyA'));
    expect(input.getKey('KeyA')).toBe(false);
  });

  it('getKey returns false for unpressed key', () => {
    expect(input.getKey('KeyA')).toBe(false);
  });

  // --- getKeyDown ---

  it('getKeyDown returns true on the frame key was pressed', () => {
    target.fire('keydown', keyEvent('KeyA'));
    expect(input.getKeyDown('KeyA')).toBe(true);
  });

  it('getKeyDown returns false after endFrame', () => {
    target.fire('keydown', keyEvent('KeyA'));
    input.endFrame();
    expect(input.getKeyDown('KeyA')).toBe(false);
  });

  it('getKeyDown does not re-trigger on held key repeat', () => {
    target.fire('keydown', keyEvent('KeyA'));
    input.endFrame();
    // Simulate OS key repeat (keydown fires again without keyup)
    target.fire('keydown', keyEvent('KeyA'));
    expect(input.getKeyDown('KeyA')).toBe(false);
  });

  // --- getKeyUp ---

  it('getKeyUp returns true on the frame key was released', () => {
    target.fire('keydown', keyEvent('KeyA'));
    input.endFrame();
    target.fire('keyup', keyEvent('KeyA'));
    expect(input.getKeyUp('KeyA')).toBe(true);
  });

  it('getKeyUp returns false after endFrame', () => {
    target.fire('keydown', keyEvent('KeyA'));
    target.fire('keyup', keyEvent('KeyA'));
    input.endFrame();
    expect(input.getKeyUp('KeyA')).toBe(false);
  });

  it('getKeyUp returns false for key that was never pressed', () => {
    expect(input.getKeyUp('KeyA')).toBe(false);
  });

  // --- mousePosition ---

  it('mousePosition defaults to 0,0', () => {
    expect(input.mousePosition.x).toBe(0);
    expect(input.mousePosition.y).toBe(0);
  });

  it('mousePosition updates relative to canvas on mousemove', () => {
    const input2 = new Input();
    const canvas = createMockCanvas(); // rect: left=10, top=20
    input2.attach(target, canvas);

    canvas.fire('mousemove', { clientX: 110, clientY: 220 });
    expect(input2.mousePosition.x).toBe(100);
    expect(input2.mousePosition.y).toBe(200);
  });

  // --- mouseDelta ---

  it('mouseDelta accumulates movementX/Y between frames', () => {
    target.fire('mousemove', { movementX: 5, movementY: -3, buttons: 0 });
    target.fire('mousemove', { movementX: 2, movementY: 4, buttons: 0 });
    expect(input.mouseDelta.x).toBe(7);
    expect(input.mouseDelta.y).toBe(1);
  });

  it('mouseDelta resets on endFrame', () => {
    target.fire('mousemove', { movementX: 10, movementY: 20, buttons: 0 });
    input.endFrame();
    expect(input.mouseDelta.x).toBe(0);
    expect(input.mouseDelta.y).toBe(0);
  });

  // --- getMouseButton ---

  it('getMouseButton returns true while button is held', () => {
    target.fire('mousedown', { buttons: 1 }); // left
    expect(input.getMouseButton(0)).toBe(true);
    expect(input.getMouseButton(2)).toBe(false);
  });

  it('getMouseButton returns false after button is released', () => {
    target.fire('mousedown', { buttons: 1 });
    target.fire('mouseup', { buttons: 0 });
    expect(input.getMouseButton(0)).toBe(false);
  });

  it('getMouseButton tracks multiple buttons', () => {
    target.fire('mousedown', { buttons: 5 }); // left + right (1 + 4)
    expect(input.getMouseButton(0)).toBe(true);  // left
    expect(input.getMouseButton(1)).toBe(false); // middle
    expect(input.getMouseButton(2)).toBe(true);  // right
  });

  // --- detach ---

  it('detach stops responding to events', () => {
    target.fire('keydown', keyEvent('KeyA'));
    input.detach();
    input.endFrame();
    target.fire('keydown', keyEvent('KeyB'));
    expect(input.getKey('KeyB')).toBe(false);
    expect(input.getKeyDown('KeyB')).toBe(false);
  });

  it('detach stops mouse events', () => {
    const input2 = new Input();
    const canvas = createMockCanvas();
    input2.attach(target, canvas);
    canvas.fire('mousemove', { clientX: 50, clientY: 60 });
    expect(input2.mousePosition.x).toBe(40);

    input2.detach();
    canvas.fire('mousemove', { clientX: 200, clientY: 300 });
    // Should not have updated
    expect(input2.mousePosition.x).toBe(40);
  });

  it('detach stops mouseDelta tracking', () => {
    target.fire('mousemove', { movementX: 5, movementY: 3, buttons: 0 });
    input.detach();
    input.endFrame();
    target.fire('mousemove', { movementX: 10, movementY: 10, buttons: 0 });
    expect(input.mouseDelta.x).toBe(0);
    expect(input.mouseDelta.y).toBe(0);
  });
});
