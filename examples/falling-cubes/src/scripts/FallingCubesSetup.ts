import { Component, GameObject, Scene } from '@certe/atmos-core';
import { MeshRenderer, createMaterial } from '@certe/atmos-renderer';
import { RigidBody, Collider } from '@certe/atmos-physics';

const CUBE_COLORS: [number, number, number, number][] = [
  [1.0, 0.2, 0.2, 1],
  [0.2, 0.8, 0.3, 1],
  [0.3, 0.3, 1.0, 1],
  [1.0, 0.7, 0.2, 1],
  [0.8, 0.2, 0.8, 1],
  [0.2, 0.9, 0.9, 1],
  [1.0, 0.5, 0.1, 1],
  [0.5, 1.0, 0.2, 1],
  [0.9, 0.9, 0.2, 1],
  [0.6, 0.3, 0.9, 1],
];

/**
 * Creates a floor and 10 falling cubes with physics.
 * Attach to an empty GameObject in the scene.
 */
export class FallingCubesSetup extends Component {
  private _initialized = false;

  onPlayStop(): void {
    this._initialized = false;
  }

  onUpdate(): void {
    if (this._initialized) return;
    this._initialized = true;

    const scene = Scene.current;
    if (!scene) return;

    // Floor
    const floor = new GameObject('Floor');
    const floorMr = floor.addComponent(MeshRenderer);
    floorMr.meshSource = 'primitive:plane';
    floorMr.material = createMaterial({ albedo: [0.4, 0.4, 0.4, 1], metallic: 0.0, roughness: 0.9 });
    const floorRb = floor.addComponent(RigidBody);
    floorRb.bodyType = 'fixed';
    const floorCol = floor.addComponent(Collider);
    floorCol.shape = { type: 'box', halfExtents: { x: 10, y: 0.01, z: 10 } };
    scene.add(floor);

    // Falling cubes
    for (let i = 0; i < 10; i++) {
      const color = CUBE_COLORS[i]!;
      const cube = new GameObject(`Cube_${i}`);

      const x = (i % 5) * 1.2 - 2.4;
      const y = 3 + i * 1.5;
      const z = i < 5 ? -0.5 : 0.5;
      cube.transform.setPosition(x, y, z);

      const mr = cube.addComponent(MeshRenderer);
      mr.meshSource = 'primitive:cube';
      mr.material = createMaterial({ albedo: color, metallic: 0.3, roughness: 0.5 });

      const rb = cube.addComponent(RigidBody);
      rb.bodyType = 'dynamic';

      const col = cube.addComponent(Collider);
      col.shape = { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
      col.restitution = 0.3;

      scene.add(cube);
    }
  }
}
