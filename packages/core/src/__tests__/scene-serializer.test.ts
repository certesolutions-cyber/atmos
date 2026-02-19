import { describe, it, expect, beforeEach } from 'vitest';
import { Scene } from '../scene.js';
import { GameObject, resetGameObjectIds } from '../game-object.js';
import { Component } from '../component.js';
import {
  registerComponent,
  clearRegistry,
} from '../component-registry.js';
import { registerCoreBuiltins } from '../register-builtins.js';
import { serializeScene, deserializeScene } from '../scene-serializer.js';

class DummyRenderer extends Component {
  material = {
    albedo: new Float32Array([1, 0, 0, 1]),
    metallic: 0.5,
    roughness: 0.3,
    dirty: false,
  };
}

beforeEach(() => {
  clearRegistry();
  resetGameObjectIds();
  registerCoreBuiltins();
});

describe('SceneSerializer', () => {
  it('serializes an empty scene', () => {
    const scene = new Scene();
    const data = serializeScene(scene);
    expect(data.gameObjects).toHaveLength(0);
  });

  it('serializes a single game object with transform', () => {
    const scene = new Scene();
    const go = new GameObject('Cube');
    go.transform.setPosition(1, 2, 3);
    scene.add(go);

    const data = serializeScene(scene);
    expect(data.gameObjects).toHaveLength(1);
    expect(data.gameObjects[0]!.name).toBe('Cube');
    expect(data.gameObjects[0]!.parentId).toBeNull();
    expect(data.gameObjects[0]!.id).toBe(go.id);

    const transformData = data.gameObjects[0]!.components.find((c) => c.type === 'Transform');
    expect(transformData).toBeDefined();
    expect(transformData!.data['position']).toEqual([1, 2, 3]);
  });

  it('serializes Float32Array as number[]', () => {
    const scene = new Scene();
    const go = new GameObject('Obj');
    go.transform.setScale(2, 2, 2);
    scene.add(go);

    const data = serializeScene(scene);
    const transform = data.gameObjects[0]!.components.find((c) => c.type === 'Transform')!;
    const scale = transform.data['scale'] as number[];
    expect(Array.isArray(scale)).toBe(true);
    expect(scale).toEqual([2, 2, 2]);
  });

  it('serializes registered component properties', () => {
    registerComponent(DummyRenderer, {
      name: 'DummyRenderer',
      properties: [
        { key: 'material.albedo', type: 'color' },
        { key: 'material.metallic', type: 'number', min: 0, max: 1 },
      ],
    });

    const scene = new Scene();
    const go = new GameObject('Obj');
    go.addComponent(DummyRenderer);
    scene.add(go);

    const data = serializeScene(scene);
    const comp = data.gameObjects[0]!.components.find((c) => c.type === 'DummyRenderer');
    expect(comp).toBeDefined();
    expect(comp!.data['material.albedo']).toEqual([1, 0, 0, 1]);
    expect(comp!.data['material.metallic']).toBe(0.5);
  });

  it('serializes parent-child relationships by id', () => {
    const scene = new Scene();
    const parent = new GameObject('Parent');
    const child = new GameObject('Child');
    child.setParent(parent);
    scene.add(parent);
    scene.add(child);

    const data = serializeScene(scene);
    const childData = data.gameObjects.find((o) => o.name === 'Child');
    expect(childData!.parentId).toBe(parent.id);
  });

  it('deserializes a scene with transform data', () => {
    const data = {
      gameObjects: [
        {
          name: 'TestObj',
          id: 1,
          parentId: null,
          components: [
            {
              type: 'Transform',
              data: {
                position: [5, 10, 15],
                scale: [2, 2, 2],
              },
            },
          ],
        },
      ],
    };

    const scene = deserializeScene(data);
    const objects = [...scene.getAllObjects()];
    expect(objects).toHaveLength(1);
    expect(objects[0]!.name).toBe('TestObj');
    expect(objects[0]!.transform.position[0]).toBeCloseTo(5);
    expect(objects[0]!.transform.position[1]).toBeCloseTo(10);
    expect(objects[0]!.transform.scale[0]).toBeCloseTo(2);
  });

  it('deserializes parent-child relationships by id', () => {
    const data = {
      gameObjects: [
        { name: 'Parent', id: 1, parentId: null, components: [] },
        { name: 'Child', id: 2, parentId: 1, components: [] },
      ],
    };

    const scene = deserializeScene(data);
    const objects = [...scene.getAllObjects()];
    const child = objects.find((o) => o.name === 'Child');
    expect(child!.parent).not.toBeNull();
    expect(child!.parent!.name).toBe('Parent');
  });

  it('deserializes legacy parentName format', () => {
    const data = {
      gameObjects: [
        { name: 'Parent', parentName: null, components: [] },
        { name: 'Child', parentName: 'Parent', components: [] },
      ],
    };

    const scene = deserializeScene(data);
    const child = [...scene.getAllObjects()].find((o) => o.name === 'Child');
    expect(child!.parent).not.toBeNull();
    expect(child!.parent!.name).toBe('Parent');
  });

  it('handles duplicate names correctly with id-based hierarchy', () => {
    const scene = new Scene();
    const a = new GameObject('Box');
    const b = new GameObject('Box');
    const child = new GameObject('Child');
    child.setParent(b);
    scene.add(a);
    scene.add(b);
    scene.add(child);

    const data = serializeScene(scene);
    const restored = deserializeScene(data);
    const restoredChild = [...restored.getAllObjects()].find((o) => o.name === 'Child');
    expect(restoredChild!.parent).not.toBeNull();
    // Child's parent should be the second Box (by id), not the first
    const restoredBoxes = [...restored.getAllObjects()].filter((o) => o.name === 'Box');
    expect(restoredBoxes).toHaveLength(2);
    expect(restoredChild!.parent).toBe(restoredBoxes[1]);
  });

  it('calls context.onComponent for non-Transform components', () => {
    const data = {
      gameObjects: [
        {
          name: 'Obj',
          id: 1,
          parentId: null,
          components: [
            { type: 'Transform', data: {} },
            { type: 'MeshRenderer', data: { 'material.metallic': 0.8 } },
          ],
        },
      ],
    };

    const calls: { type: string; data: Record<string, unknown> }[] = [];
    deserializeScene(data, {
      onComponent(_, type, componentData) {
        calls.push({ type, data: componentData });
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.type).toBe('MeshRenderer');
    expect(calls[0]!.data['material.metallic']).toBe(0.8);
  });

  it('serializes gameObjectRef as id', () => {
    class DummyJoint extends Component {
      target: GameObject | null = null;
    }
    registerComponent(DummyJoint, {
      name: 'DummyJoint',
      properties: [
        { key: 'target', type: 'gameObjectRef' },
      ],
    });

    const scene = new Scene();
    const goA = new GameObject('A');
    const goB = new GameObject('B');
    const joint = goA.addComponent(DummyJoint);
    joint.target = goB;
    scene.add(goA);
    scene.add(goB);

    const data = serializeScene(scene);
    // Should be serializable without circular reference errors
    const json = JSON.stringify(data);
    expect(json).toBeDefined();

    const comp = data.gameObjects[0]!.components.find((c) => c.type === 'DummyJoint');
    expect(comp!.data['target']).toBe(goB.id);

    // Deserialize and verify ref resolves back to a GameObject
    const calls: { type: string; data: Record<string, unknown> }[] = [];
    deserializeScene(JSON.parse(json), {
      onComponent(_, type, componentData) {
        calls.push({ type, data: componentData });
      },
    });

    const jointCall = calls.find((c) => c.type === 'DummyJoint');
    expect(jointCall).toBeDefined();
    expect(jointCall!.data['target']).toBeInstanceOf(GameObject);
    expect((jointCall!.data['target'] as GameObject).name).toBe('B');
  });

  it('round-trips serialize → deserialize preserving transform', () => {
    const scene = new Scene();
    const go = new GameObject('RoundTrip');
    go.transform.setPosition(3, 7, -2);
    go.transform.setScale(1.5, 1.5, 1.5);
    scene.add(go);

    const data = serializeScene(scene);
    const json = JSON.stringify(data);
    const restored = deserializeScene(JSON.parse(json));

    const objects = [...restored.getAllObjects()];
    expect(objects).toHaveLength(1);
    expect(objects[0]!.transform.position[0]).toBeCloseTo(3);
    expect(objects[0]!.transform.position[1]).toBeCloseTo(7);
    expect(objects[0]!.transform.position[2]).toBeCloseTo(-2);
    expect(objects[0]!.transform.scale[0]).toBeCloseTo(1.5);
  });
});
