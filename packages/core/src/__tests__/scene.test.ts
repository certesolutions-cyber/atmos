import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../component.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';
import { Scene } from '../scene.js';

class TrackingComponent extends Component {
  awakeOrder: number[] = [];
  startOrder: number[] = [];
  updateDts: number[] = [];
  destroyed = false;
  static counter = 0;
  myOrder = 0;

  onAwake(): void {
    this.myOrder = TrackingComponent.counter++;
    this.awakeOrder.push(this.myOrder);
  }
  onStart(): void {
    this.startOrder.push(this.myOrder);
  }
  onUpdate(dt: number): void {
    this.updateDts.push(dt);
  }
  onDestroy(): void {
    this.destroyed = true;
  }
}

describe('Scene', () => {
  beforeEach(() => {
    resetGameObjectIds();
    TrackingComponent.counter = 0;
  });

  it('tracks root objects', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    scene.add(go);
    expect(scene.roots.length).toBe(1);
  });

  it('does not add duplicates', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    scene.add(go);
    scene.add(go);
    expect(scene.roots.length).toBe(1);
  });

  it('awakeAll calls onAwake on all components', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    const comp = go.addComponent(TrackingComponent);
    scene.add(go);
    scene.awakeAll();
    expect(comp.awakeOrder.length).toBe(1);
  });

  it('startAll calls onStart once', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    const comp = go.addComponent(TrackingComponent);
    scene.add(go);
    scene.awakeAll();
    scene.startAll();
    scene.startAll(); // second call should be a no-op
    expect(comp.startOrder.length).toBe(1);
  });

  it('updateAll calls onUpdate with dt', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    const comp = go.addComponent(TrackingComponent);
    scene.add(go);
    scene.updateAll(0.016);
    scene.updateAll(0.017);
    expect(comp.updateDts).toEqual([0.016, 0.017]);
  });

  it('remove calls onDestroy', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    const comp = go.addComponent(TrackingComponent);
    scene.add(go);
    scene.remove(go);
    expect(comp.destroyed).toBe(true);
    expect(scene.roots.length).toBe(0);
  });

  it('skips disabled components for update', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    const comp = go.addComponent(TrackingComponent);
    comp.enabled = false;
    scene.add(go);
    scene.updateAll(0.016);
    expect(comp.updateDts.length).toBe(0);
  });

  it('calls onDestroy on disabled components when removing', () => {
    const scene = new Scene();
    const go = new GameObject('A');
    const comp = go.addComponent(TrackingComponent);
    comp.enabled = false;
    scene.add(go);
    scene.remove(go);
    expect(comp.destroyed).toBe(true);
  });
});
