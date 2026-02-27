import { Component, GameObject, Scene } from '@certe/atmos-core';
import { MeshRenderer, createMaterial } from '@certe/atmos-renderer';
import { RigidBody, Collider } from '@certe/atmos-physics';

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
 * No manual init() calls — RenderSystem and PhysicsSystem resolve everything.
 */
export class BallDropper extends Component {
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

    // Mesh — meshSource auto-resolved, material set directly with color
    const mr = ball.addComponent(MeshRenderer);
    mr.meshSource = 'primitive:sphere';
    mr.material = createMaterial({ albedo: color, metallic: 0.3, roughness: 0.4 });

    // Physics — auto-initialized by PhysicsSystem
    const rb = ball.addComponent(RigidBody);
    rb.bodyType = 'dynamic';

    const col = ball.addComponent(Collider);
    col.shape = { type: 'sphere', radius: 0.5 };
    col.restitution = 0.6;

    Scene.current!.add(ball);
    this._balls.push(ball);
  }
}
