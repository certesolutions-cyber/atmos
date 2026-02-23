import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../component.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';
import { Scene } from '../scene.js';

class TestComponent extends Component {
  awakeCalled = false;
  startCalled = false;
  updateCount = 0;
  lastDt = 0;

  onAwake(): void {
    this.awakeCalled = true;
  }
  onStart(): void {
    this.startCalled = true;
  }
  onUpdate(dt: number): void {
    this.updateCount++;
    this.lastDt = dt;
  }
}

class OtherComponent extends Component {}

describe('Component', () => {
  beforeEach(() => resetGameObjectIds());

  it('has a back-reference to its GameObject', () => {
    const go = new GameObject('Test');
    const comp = go.addComponent(TestComponent);
    expect(comp.gameObject).toBe(go);
  });

  it('is enabled by default', () => {
    const go = new GameObject('Test');
    const comp = go.addComponent(TestComponent);
    expect(comp.enabled).toBe(true);
  });

  it('lifecycle methods are callable', () => {
    const go = new GameObject('Test');
    const comp = go.addComponent(TestComponent);
    comp.onAwake();
    expect(comp.awakeCalled).toBe(true);
    comp.onStart();
    expect(comp.startCalled).toBe(true);
    comp.onUpdate(0.016);
    expect(comp.updateCount).toBe(1);
    expect(comp.lastDt).toBeCloseTo(0.016, 5);
  });

  it('getComponent returns sibling component', () => {
    const go = new GameObject('Test');
    const tc = go.addComponent(TestComponent);
    const oc = go.addComponent(OtherComponent);
    expect(tc.getComponent(OtherComponent)).toBe(oc);
    expect(oc.getComponent(TestComponent)).toBe(tc);
  });

  it('getComponent returns null when not found', () => {
    const go = new GameObject('Test');
    const tc = go.addComponent(TestComponent);
    expect(tc.getComponent(OtherComponent)).toBeNull();
  });

  it('getAllComponents returns matching siblings', () => {
    const go = new GameObject('Test');
    const tc = go.addComponent(TestComponent);
    go.addComponent(OtherComponent);
    const result = tc.getAllComponents(OtherComponent);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(OtherComponent);
  });

  it('findAll returns components from the current scene', () => {
    const scene = new Scene();
    Scene.current = scene;

    const a = new GameObject('A');
    a.addComponent(TestComponent);
    scene.add(a);

    const b = new GameObject('B');
    b.addComponent(OtherComponent);
    scene.add(b);

    const c = new GameObject('C');
    c.addComponent(TestComponent);
    scene.add(c);

    const found = Component.findAll(TestComponent);
    expect(found).toHaveLength(2);
    expect(found.every(c => c instanceof TestComponent)).toBe(true);

    Scene.current = null;
  });

  it('findAll returns empty array when no scene', () => {
    Scene.current = null;
    expect(Component.findAll(TestComponent)).toEqual([]);
  });
});
