import RAPIER from '@dimforge/rapier3d-compat';

export interface PhysicsWorldOptions {
  gravity?: { x: number; y: number; z: number };
  fixedTimestep?: number;
  solverIterations?: number;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  fixedTimestep: number;
  substeps = 1;
  private _accumulator = 0;

  /** Time remaining after the last fixed step (for interpolation/extrapolation). */
  get accumulator(): number { return this._accumulator; }

  constructor(options: PhysicsWorldOptions = {}) {
    const g = options.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
    this.world = new RAPIER.World(new RAPIER.Vector3(g.x, g.y, g.z));
    if (options.solverIterations !== undefined) {
      this.world.numSolverIterations = options.solverIterations;
    }
  }

  setGravity(x: number, y: number, z: number): void {
    this.world.gravity = new RAPIER.Vector3(x, y, z);
  }

  setSolverIterations(n: number): void {
    this.world.numSolverIterations = n;
  }

  /** Advance the simulation by dt seconds using fixed timestep accumulator. Returns steps taken. */
  step(dt: number): number {
    this._accumulator += dt;
    let steps = 0;
    const sub = Math.max(1, this.substeps);
    while (this._accumulator >= this.fixedTimestep) {
      const subDt = this.fixedTimestep / sub;
      for (let s = 0; s < sub; s++) {
        this.world.timestep = subDt;
        this.world.step();
      }
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

  /** Reset the fixed-timestep accumulator (e.g. after pause→play). */
  resetAccumulator(): void {
    this._accumulator = 0;
  }

  destroy(): void {
    this.world.free();
  }
}
