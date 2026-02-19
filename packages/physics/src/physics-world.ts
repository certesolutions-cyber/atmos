import RAPIER from '@dimforge/rapier3d-compat';

export interface PhysicsWorldOptions {
  gravity?: { x: number; y: number; z: number };
  fixedTimestep?: number;
  solverIterations?: number;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly fixedTimestep: number;
  private _accumulator = 0;

  constructor(options: PhysicsWorldOptions = {}) {
    const g = options.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
    this.world = new RAPIER.World(new RAPIER.Vector3(g.x, g.y, g.z));
    if (options.solverIterations !== undefined) {
      this.world.numSolverIterations = options.solverIterations;
    }
  }

  /** Advance the simulation by dt seconds using fixed timestep accumulator. Returns steps taken. */
  step(dt: number): number {
    this._accumulator += dt;
    let steps = 0;
    while (this._accumulator >= this.fixedTimestep) {
      this.world.step();
      this._accumulator -= this.fixedTimestep;
      steps++;
    }
    return steps;
  }

  createRigidBody(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody {
    return this.world.createRigidBody(desc);
  }

  createCollider(
    desc: RAPIER.ColliderDesc,
    body: RAPIER.RigidBody,
  ): RAPIER.Collider {
    return this.world.createCollider(desc, body);
  }

  removeRigidBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  removeCollider(collider: RAPIER.Collider): void {
    this.world.removeCollider(collider, true);
  }

  createJoint(
    data: RAPIER.JointData,
    body1: RAPIER.RigidBody,
    body2: RAPIER.RigidBody,
  ): RAPIER.ImpulseJoint {
    return this.world.createImpulseJoint(data, body1, body2, true);
  }

  removeJoint(joint: RAPIER.ImpulseJoint): void {
    this.world.removeImpulseJoint(joint, true);
  }

  destroy(): void {
    this.world.free();
  }
}
