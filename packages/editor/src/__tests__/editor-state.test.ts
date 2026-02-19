import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, GameObject, resetGameObjectIds } from '@atmos/core';
import { EditorState } from '../editor-state.js';

let scene: Scene;
let state: EditorState;

beforeEach(() => {
  resetGameObjectIds();
  scene = new Scene();
  state = new EditorState(scene);
});

describe('EditorState', () => {
  it('starts with no selection', () => {
    expect(state.selected).toBeNull();
    expect(state.paused).toBe(true);
  });

  it('selects a game object', () => {
    const go = new GameObject('Test');
    scene.add(go);
    state.select(go);
    expect(state.selected).toBe(go);
  });

  it('deselects', () => {
    const go = new GameObject('Test');
    state.select(go);
    state.deselect();
    expect(state.selected).toBeNull();
  });

  it('fires selectionChanged event', () => {
    let fired = false;
    state.on('selectionChanged', () => {
      fired = true;
    });
    state.select(new GameObject('Test'));
    expect(fired).toBe(true);
  });

  it('does not fire if selecting same object', () => {
    const go = new GameObject('Test');
    state.select(go);
    let fired = false;
    state.on('selectionChanged', () => {
      fired = true;
    });
    state.select(go);
    expect(fired).toBe(false);
  });

  it('toggles pause', () => {
    expect(state.paused).toBe(true);
    state.togglePause();
    expect(state.paused).toBe(false);
    state.togglePause();
    expect(state.paused).toBe(true);
  });

  it('fires pauseChanged event', () => {
    let count = 0;
    state.on('pauseChanged', () => count++);
    state.togglePause();
    state.togglePause();
    expect(count).toBe(2);
  });

  it('unsubscribe stops receiving events', () => {
    let count = 0;
    const unsub = state.on('selectionChanged', () => count++);
    state.select(new GameObject('A'));
    expect(count).toBe(1);
    unsub();
    state.select(new GameObject('B'));
    expect(count).toBe(1);
  });

  it('setScene fires sceneChanged and clears selection', () => {
    const go = new GameObject('Test');
    state.select(go);

    let sceneChanged = false;
    let selChanged = false;
    state.on('sceneChanged', () => {
      sceneChanged = true;
    });
    state.on('selectionChanged', () => {
      selChanged = true;
    });

    const newScene = new Scene();
    state.setScene(newScene);

    expect(state.scene).toBe(newScene);
    expect(state.selected).toBeNull();
    expect(sceneChanged).toBe(true);
    expect(selChanged).toBe(true);
  });
});
