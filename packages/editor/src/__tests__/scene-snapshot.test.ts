import { describe, it, expect, beforeEach } from 'vitest';
import {
  Scene,
  GameObject,
  Component,
  registerComponent,
  clearRegistry,
  resetGameObjectIds,
} from '@atmos/core';
import { Quat } from '@atmos/math';
import type { QuatType } from '@atmos/math';
import { takeSnapshot, restoreSnapshot } from '../scene-snapshot.js';

const _tmpQuat: QuatType = Quat.create();

class TestComp extends Component {
  speed = 10;
  label = 'hello';
  active = true;
}

class RefComp extends Component {
  target: GameObject | null = null;
}

let scene: Scene;

beforeEach(() => {
  resetGameObjectIds();
  clearRegistry();
  scene = new Scene();
});

describe('takeSnapshot / restoreSnapshot', () => {
  it('captures and restores transform values', () => {
    const go = new GameObject('A');
    go.transform.setPosition(1, 2, 3);
    Quat.fromEuler(_tmpQuat, 0, 90, 0);
    go.transform.setRotationFrom(_tmpQuat);
    go.transform.setScale(2, 2, 2);
    scene.add(go);

    const snap = takeSnapshot(scene);

    // Mutate transforms
    go.transform.setPosition(99, 99, 99);
    go.transform.setRotation(0, 0, 0, 1);
    go.transform.setScale(5, 5, 5);

    restoreSnapshot(scene, snap);

    expect(go.transform.position[0]).toBeCloseTo(1);
    expect(go.transform.position[1]).toBeCloseTo(2);
    expect(go.transform.position[2]).toBeCloseTo(3);
    expect(go.transform.scale[0]).toBeCloseTo(2);
    expect(go.transform.scale[1]).toBeCloseTo(2);
    expect(go.transform.scale[2]).toBeCloseTo(2);
  });

  it('captures and restores registered component properties', () => {
    registerComponent(TestComp, {
      name: 'TestComp',
      properties: [
        { key: 'speed', type: 'number' },
        { key: 'label', type: 'string' },
        { key: 'active', type: 'boolean' },
      ],
    });

    const go = new GameObject('B');
    const comp = go.addComponent(TestComp);
    comp.speed = 42;
    comp.label = 'original';
    comp.active = false;
    scene.add(go);

    const snap = takeSnapshot(scene);

    // Mutate
    comp.speed = 999;
    comp.label = 'changed';
    comp.active = true;

    restoreSnapshot(scene, snap);

    expect(comp.speed).toBe(42);
    expect(comp.label).toBe('original');
    expect(comp.active).toBe(false);
  });

  it('saves gameObjectRef as id and restores as live GameObject', () => {
    registerComponent(RefComp, {
      name: 'RefComp',
      properties: [{ key: 'target', type: 'gameObjectRef' }],
    });

    const a = new GameObject('A');
    const b = new GameObject('B');
    const comp = a.addComponent(RefComp);
    comp.target = b;
    scene.add(a);
    scene.add(b);

    const snap = takeSnapshot(scene);

    // Clear reference
    comp.target = null;

    restoreSnapshot(scene, snap);

    expect(comp.target).toBe(b);
  });

  it('skips objects not found in scene', () => {
    const go = new GameObject('A');
    go.transform.setPosition(5, 5, 5);
    scene.add(go);

    const snap = takeSnapshot(scene);

    // Remove object from scene
    scene.remove(go);

    // Should not throw
    restoreSnapshot(scene, snap);
  });

  it('marks transforms dirty after restore', () => {
    const go = new GameObject('A');
    go.transform.setPosition(1, 2, 3);
    scene.add(go);

    const snap = takeSnapshot(scene);

    go.transform.updateWorldMatrix(); // clears dirty
    expect(go.transform.isDirty).toBe(false);

    restoreSnapshot(scene, snap);

    expect(go.transform.isDirty).toBe(true);
  });
});
