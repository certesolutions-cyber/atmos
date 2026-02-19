import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../component.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';

class DummyComponent extends Component {
  destroyed = false;
  onDestroy(): void { this.destroyed = true; }
}
class AnotherComponent extends Component {}

describe('GameObject', () => {
  beforeEach(() => resetGameObjectIds());

  it('has a unique ID', () => {
    const a = new GameObject('A');
    const b = new GameObject('B');
    expect(a.id).not.toBe(b.id);
  });

  it('has a Transform by default', () => {
    const go = new GameObject('Test');
    expect(go.transform).toBeDefined();
  });

  it('stores and retrieves components', () => {
    const go = new GameObject('Test');
    const comp = go.addComponent(DummyComponent);
    expect(go.getComponent(DummyComponent)).toBe(comp);
  });

  it('returns null for missing component', () => {
    const go = new GameObject('Test');
    expect(go.getComponent(DummyComponent)).toBeNull();
  });

  it('supports multiple components', () => {
    const go = new GameObject('Test');
    go.addComponent(DummyComponent);
    go.addComponent(AnotherComponent);
    expect(go.getComponents().length).toBe(2);
  });

  it('removes a component', () => {
    const go = new GameObject('Test');
    const comp = go.addComponent(DummyComponent);
    go.removeComponent(comp);
    expect(go.getComponent(DummyComponent)).toBeNull();
  });

  it('calls onDestroy when removing a component', () => {
    const go = new GameObject('Test');
    const comp = go.addComponent(DummyComponent);
    go.removeComponent(comp);
    expect(comp.destroyed).toBe(true);
  });

  it('supports parent-child hierarchy', () => {
    const parent = new GameObject('Parent');
    const child = new GameObject('Child');
    child.setParent(parent);
    expect(child.parent).toBe(parent);
    expect(parent.children).toContain(child);
  });

  it('removes from old parent when reparenting', () => {
    const parent1 = new GameObject('P1');
    const parent2 = new GameObject('P2');
    const child = new GameObject('Child');
    child.setParent(parent1);
    child.setParent(parent2);
    expect(parent1.children.length).toBe(0);
    expect(parent2.children).toContain(child);
  });

  it('syncs transform hierarchy with object hierarchy', () => {
    const parent = new GameObject('Parent');
    const child = new GameObject('Child');
    child.setParent(parent);
    expect(child.transform.parent).toBe(parent.transform);
  });
});
