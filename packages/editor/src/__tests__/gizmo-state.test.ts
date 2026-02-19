import { describe, it, expect, beforeEach } from 'vitest';
import { GizmoState } from '../gizmo-state.js';

describe('GizmoState', () => {
  let state: GizmoState;

  beforeEach(() => {
    state = new GizmoState();
  });

  it('has default mode translate', () => {
    expect(state.mode).toBe('translate');
  });

  it('has no active axis initially', () => {
    expect(state.activeAxis).toBeNull();
  });

  it('is not dragging initially', () => {
    expect(state.dragging).toBe(false);
  });

  it('snap defaults to disabled', () => {
    expect(state.snapEnabled).toBe(false);
  });

  it('default snap size is 1', () => {
    expect(state.snapSize).toBe(1.0);
  });

  it('endDrag clears state', () => {
    state.dragging = true;
    state.activeAxis = 'x';
    state.endDrag();
    expect(state.dragging).toBe(false);
    expect(state.activeAxis).toBeNull();
  });

  it('mode can be changed', () => {
    state.mode = 'rotate';
    expect(state.mode).toBe('rotate');
    state.mode = 'scale';
    expect(state.mode).toBe('scale');
  });
});
