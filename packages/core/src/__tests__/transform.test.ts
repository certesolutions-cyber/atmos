import { describe, it, expect } from 'vitest';
import { Transform } from '../transform.js';
describe('Transform', () => {
  it('starts at origin with identity rotation and unit scale', () => {
    const t = new Transform();
    expect(t.position[0]).toBe(0);
    expect(t.position[1]).toBe(0);
    expect(t.position[2]).toBe(0);
    expect(t.scale[0]).toBe(1);
    expect(t.scale[1]).toBe(1);
    expect(t.scale[2]).toBe(1);
    expect(t.rotation[3]).toBe(1); // w = 1 for identity quat
  });

  it('local matrix reflects position', () => {
    const t = new Transform();
    t.setPosition(5, 10, 15);
    t.updateWorldMatrix();
    expect(t.localMatrix[12]).toBeCloseTo(5, 5);
    expect(t.localMatrix[13]).toBeCloseTo(10, 5);
    expect(t.localMatrix[14]).toBeCloseTo(15, 5);
  });

  it('world matrix inherits parent transform', () => {
    const parent = new Transform();
    const child = new Transform();
    child.setParent(parent);

    parent.setPosition(10, 0, 0);
    child.setPosition(5, 0, 0);

    parent.updateWorldMatrix();

    // Child world x = parent x + child x = 15
    expect(child.worldMatrix[12]).toBeCloseTo(15, 5);
  });

  it('dirty flag propagates to children', () => {
    const parent = new Transform();
    const child = new Transform();
    child.setParent(parent);

    // Initially all dirty
    parent.updateWorldMatrix();
    expect(parent.isDirty).toBe(false);
    expect(child.isDirty).toBe(false);

    parent.setPosition(1, 0, 0); // any setter triggers dirty
    expect(parent.isDirty).toBe(true);
    expect(child.isDirty).toBe(true);
  });

  it('setParent updates hierarchy correctly', () => {
    const a = new Transform();
    const b = new Transform();
    const c = new Transform();

    b.setParent(a);
    expect(a.children).toContain(b);

    b.setParent(c);
    expect(a.children.length).toBe(0);
    expect(c.children).toContain(b);

    b.setParent(null);
    expect(c.children.length).toBe(0);
    expect(b.parent).toBeNull();
  });

  it('setParent marks parent chain dirty even if child is already dirty', () => {
    const root = new Transform();
    const parent = new Transform();
    parent.setParent(root);

    // Clear all dirty flags
    root.updateWorldMatrix();
    expect(root.isDirty).toBe(false);
    expect(parent.isDirty).toBe(false);

    // Create a new child (born with _dirty = true)
    const child = new Transform();
    expect(child.isDirty).toBe(true);

    // Attach child to parent — root must become dirty so renderAll picks it up
    child.setParent(parent);
    expect(parent.isDirty).toBe(true);
    expect(root.isDirty).toBe(true);
  });
});
