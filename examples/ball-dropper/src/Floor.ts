import { Component } from '@certe/atmos-core';
import { MeshRenderer, createMaterial } from '@certe/atmos-renderer';
import { RigidBody, Collider } from '@certe/atmos-physics';

/**
 * Self-configuring floor. Add to a GameObject and it sets up
 * mesh, rigid body, and collider automatically.
 */
export class Floor extends Component {
  onAwake(): void {
    const mr = this.gameObject.addComponent(MeshRenderer);
    mr.meshSource = 'primitive:plane';
    mr.material = createMaterial({ albedo: [0.35, 0.35, 0.4, 1], metallic: 0, roughness: 0.9 });

    const rb = this.gameObject.addComponent(RigidBody);
    rb.bodyType = 'fixed';

    const col = this.gameObject.addComponent(Collider);
    col.shape = { type: 'box', halfExtents: { x: 10, y: 0.01, z: 10 } };
  }
}
