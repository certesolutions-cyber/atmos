import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerComponent,
  getComponentDef,
  getAllRegisteredComponents,
  clearRegistry,
} from '../component-registry.js';
import { Component } from '../component.js';

class TestComponent extends Component {
  speed = 5;
}

class AnotherComponent extends Component {
  label = 'hello';
}

beforeEach(() => {
  clearRegistry();
});

describe('ComponentRegistry', () => {
  it('registers and retrieves a component def', () => {
    registerComponent(TestComponent, {
      name: 'TestComponent',
      properties: [{ key: 'speed', type: 'number', min: 0, max: 100 }],
    });
    const def = getComponentDef(TestComponent);
    expect(def).toBeDefined();
    expect(def!.name).toBe('TestComponent');
    expect(def!.properties).toHaveLength(1);
  });

  it('returns undefined for unregistered component', () => {
    const def = getComponentDef(AnotherComponent);
    expect(def).toBeUndefined();
  });

  it('getAllRegisteredComponents returns all registered', () => {
    registerComponent(TestComponent, { name: 'Test', properties: [] });
    registerComponent(AnotherComponent, { name: 'Another', properties: [] });
    const all = getAllRegisteredComponents();
    expect(all.size).toBe(2);
  });

  it('clearRegistry removes all entries', () => {
    registerComponent(TestComponent, { name: 'Test', properties: [] });
    clearRegistry();
    expect(getComponentDef(TestComponent)).toBeUndefined();
    expect(getAllRegisteredComponents().size).toBe(0);
  });

  it('overwrites existing registration', () => {
    registerComponent(TestComponent, { name: 'V1', properties: [] });
    registerComponent(TestComponent, {
      name: 'V2',
      properties: [{ key: 'speed', type: 'number' }],
    });
    const def = getComponentDef(TestComponent);
    expect(def!.name).toBe('V2');
    expect(def!.properties).toHaveLength(1);
  });

  it('handles number property with min/max/step', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'speed', type: 'number', min: 0, max: 10, step: 0.5 }],
    });
    const def = getComponentDef(TestComponent);
    const prop = def!.properties[0]!;
    expect(prop.type).toBe('number');
    if (prop.type === 'number') {
      expect(prop.min).toBe(0);
      expect(prop.max).toBe(10);
      expect(prop.step).toBe(0.5);
    }
  });

  it('handles vec3 property', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'position', type: 'vec3' }],
    });
    const def = getComponentDef(TestComponent);
    expect(def!.properties[0]!.type).toBe('vec3');
  });

  it('handles quat property', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'rotation', type: 'quat' }],
    });
    const def = getComponentDef(TestComponent);
    expect(def!.properties[0]!.type).toBe('quat');
  });

  it('handles color property', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'color', type: 'color' }],
    });
    const def = getComponentDef(TestComponent);
    expect(def!.properties[0]!.type).toBe('color');
  });

  it('handles enum property with options', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'mode', type: 'enum', options: ['a', 'b', 'c'] }],
    });
    const def = getComponentDef(TestComponent);
    const prop = def!.properties[0]!;
    expect(prop.type).toBe('enum');
    if (prop.type === 'enum') {
      expect(prop.options).toEqual(['a', 'b', 'c']);
    }
  });

  it('handles boolean property', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'enabled', type: 'boolean' }],
    });
    const def = getComponentDef(TestComponent);
    expect(def!.properties[0]!.type).toBe('boolean');
  });

  it('handles dotted key paths', () => {
    registerComponent(TestComponent, {
      name: 'Test',
      properties: [{ key: 'material.metallic', type: 'number', min: 0, max: 1 }],
    });
    const def = getComponentDef(TestComponent);
    expect(def!.properties[0]!.key).toBe('material.metallic');
  });
});
