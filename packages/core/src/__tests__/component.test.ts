import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../component.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';

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
});
