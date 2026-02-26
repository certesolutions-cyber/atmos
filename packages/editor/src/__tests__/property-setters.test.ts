import { describe, it, expect, beforeEach } from 'vitest';
import { Component, GameObject, resetGameObjectIds } from '@certe/atmos-core';
import type { PropertyDef } from '@certe/atmos-core';
import { getProperty, setProperty } from '../property-setters.js';

class MockRenderer extends Component {
  material = {
    albedo: new Float32Array([1, 0, 0, 1]),
    metallic: 0.5,
    roughness: 0.3,
    dirty: false,
  };
}

let go: GameObject;

beforeEach(() => {
  resetGameObjectIds();
  go = new GameObject('Test');
});

describe('property-setters', () => {
  it('gets a simple number property', () => {
    const comp = go.addComponent(MockRenderer);
    const def: PropertyDef = { key: 'material.metallic', type: 'number' };
    expect(getProperty(comp, def)).toBe(0.5);
  });

  it('gets a Float32Array as number[]', () => {
    const comp = go.addComponent(MockRenderer);
    const def: PropertyDef = { key: 'material.albedo', type: 'color' };
    const val = getProperty(comp, def);
    expect(Array.isArray(val)).toBe(true);
    expect(val).toEqual([1, 0, 0, 1]);
  });

  it('sets a simple number via dotted path', () => {
    const comp = go.addComponent(MockRenderer);
    const def: PropertyDef = { key: 'material.metallic', type: 'number' };
    setProperty(comp, def, 0.9);
    expect(comp.material.metallic).toBe(0.9);
  });

  it('sets Float32Array by copying values', () => {
    const comp = go.addComponent(MockRenderer);
    const def: PropertyDef = { key: 'material.albedo', type: 'color' };
    const originalRef = comp.material.albedo;
    setProperty(comp, def, [0.2, 0.3, 0.4, 1]);
    // Same Float32Array instance (zero alloc)
    expect(comp.material.albedo).toBe(originalRef);
    expect(comp.material.albedo[0]).toBeCloseTo(0.2);
    expect(comp.material.albedo[1]).toBeCloseTo(0.3);
    expect(comp.material.albedo[2]).toBeCloseTo(0.4);
  });

  it('marks material dirty on material property change', () => {
    const comp = go.addComponent(MockRenderer);
    comp.material.dirty = false;
    const def: PropertyDef = { key: 'material.metallic', type: 'number' };
    setProperty(comp, def, 0.8);
    expect(comp.material.dirty).toBe(true);
  });

  it('marks transform dirty via gameObject reference', () => {
    const comp = go.addComponent(MockRenderer);
    // Access transform dirty state indirectly
    go.transform.updateWorldMatrix(); // clears dirty
    expect(go.transform.isDirty).toBe(false);
    const def: PropertyDef = { key: 'material.metallic', type: 'number' };
    setProperty(comp, def, 0.1);
    expect(go.transform.isDirty).toBe(true);
  });

  it('gets vec3 transform property', () => {
    const def: PropertyDef = { key: 'position', type: 'vec3' };
    go.transform.setPosition(5, 10, 15);
    const val = getProperty(go.transform, def);
    expect(val).toEqual([5, 10, 15]);
  });

  it('sets vec3 transform property by copying into Float32Array', () => {
    const def: PropertyDef = { key: 'position', type: 'vec3' };
    const originalRef = go.transform.position;
    setProperty(go.transform, def, [3, 6, 9]);
    expect(go.transform.position).toBe(originalRef);
    expect(go.transform.position[0]).toBeCloseTo(3);
    expect(go.transform.position[1]).toBeCloseTo(6);
    expect(go.transform.position[2]).toBeCloseTo(9);
  });
});
