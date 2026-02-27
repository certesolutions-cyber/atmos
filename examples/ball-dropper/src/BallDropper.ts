import { Component, GameObject, Scene } from '@certe/atmos-core';
import { RigidBody, Collider } from '@certe/atmos-physics';
import {
  MeshRenderer,
  RenderSystem,
  createMesh,
  createMaterial,
  createSphereGeometry,
} from '@certe/atmos-renderer';
import type { Mesh, Material } from '@certe/atmos-renderer';

const COLORS: [number, number, number, number][] = [
  [1.0, 0.2, 0.2, 1],
  [0.2, 0.8, 0.3, 1],
  [0.3, 0.3, 1.0, 1],
  [1.0, 0.7, 0.2, 1],
  [0.8, 0.2, 0.8, 1],
  [0.2, 0.9, 0.9, 1],
];

const MAX_BALLS = 50;

/**
 * Drops a ball on each click using runtime addComponent + auto-init.
 * No manual rb.init() / col.init() — PhysicsSystem picks them up next step.
 */
export class BallDropper extends Component {
  renderSystem!: RenderSystem;
  sphereMesh!: Mesh;
  private _balls: GameObject[] = [];
  private _colorIndex = 0;
  private _onClick = () => this._dropBall();

  onAwake(): void {
    window.addEventListener('click', this._onClick);
  }

  onDestroy(): void {
    window.removeEventListener('click', this._onClick);
  }

  private _dropBall(): void {
    // Remove oldest ball if at limit
    if (this._balls.length >= MAX_BALLS) {
      const old = this._balls.shift()!;
      Scene.current!.remove(old);
    }

    const color = COLORS[this._colorIndex % COLORS.length]!;
    this._colorIndex++;

    const ball = new GameObject(`Ball_${this._colorIndex}`);
    const x = (Math.random() - 0.5) * 6;
    const z = (Math.random() - 0.5) * 6;
    ball.transform.setPosition(x, 8 + Math.random() * 4, z);

    // Mesh
    const mr = ball.addComponent(MeshRenderer);
    const mat = createMaterial({ albedo: color, metallic: 0.3, roughness: 0.4 });
    mr.init(this.renderSystem, this.sphereMesh, mat);

    // Physics via auto-init — just set properties, no manual init() needed
    const rb = ball.addComponent(RigidBody);
    rb.bodyType = 'dynamic';

    const col = ball.addComponent(Collider);
    col.shape = { type: 'sphere', radius: 0.5 };
    col.restitution = 0.6;

    Scene.current!.add(ball);
    this._balls.push(ball);
  }
}
