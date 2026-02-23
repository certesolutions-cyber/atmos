import { Vec3, Mat4, Quat } from '@atmos/math';
import type { Vec3Type, Mat4Type, QuatType } from '@atmos/math';

export class Transform {
  readonly position: Vec3Type = Vec3.fromValues(0, 0, 0);
  readonly rotation: QuatType = Quat.create();
  readonly scale: Vec3Type = Vec3.fromValues(1, 1, 1);

  readonly localMatrix: Mat4Type = Mat4.create();
  readonly worldMatrix: Mat4Type = Mat4.create();

  private _dirty = true;
  private _parent: Transform | null = null;
  private readonly _children: Transform[] = [];

  get parent(): Transform | null {
    return this._parent;
  }

  get children(): readonly Transform[] {
    return this._children;
  }

  setParent(parent: Transform | null): void {
    if (this._parent === parent) return;
    if (this._parent) {
      const idx = this._parent._children.indexOf(this);
      if (idx !== -1) this._parent._children.splice(idx, 1);
    }
    this._parent = parent;
    if (parent) {
      parent._children.push(this);
    }
    this.markDirty();
    // If this node was already dirty (e.g. newly created), markDirty()
    // short-circuits and won't propagate up to the new parent chain.
    // Ensure the new parent chain is marked dirty so renderAll picks it up.
    if (parent) {
      let p: Transform | null = parent;
      while (p && !p._dirty) {
        p._dirty = true;
        p = p._parent;
      }
    }
  }

  setPosition(x: number, y: number, z: number): void {
    this.position[0] = x; this.position[1] = y; this.position[2] = z;
    this.markDirty();
  }

  setPositionFrom(v: ArrayLike<number>): void {
    this.position[0] = v[0]!; this.position[1] = v[1]!; this.position[2] = v[2]!;
    this.markDirty();
  }

  setPositionComponent(i: number, v: number): void {
    this.position[i] = v;
    this.markDirty();
  }

  setRotation(x: number, y: number, z: number, w: number): void {
    this.rotation[0] = x; this.rotation[1] = y; this.rotation[2] = z; this.rotation[3] = w;
    this.markDirty();
  }

  setRotationFrom(q: ArrayLike<number>): void {
    this.rotation[0] = q[0]!; this.rotation[1] = q[1]!; this.rotation[2] = q[2]!; this.rotation[3] = q[3]!;
    this.markDirty();
  }

  setScale(x: number, y: number, z: number): void {
    this.scale[0] = x; this.scale[1] = y; this.scale[2] = z;
    this.markDirty();
  }

  setScaleFrom(v: ArrayLike<number>): void {
    this.scale[0] = v[0]!; this.scale[1] = v[1]!; this.scale[2] = v[2]!;
    this.markDirty();
  }

  setScaleComponent(i: number, v: number): void {
    this.scale[i] = v;
    this.markDirty();
  }

  private markDirty(): void {
    if (this._dirty) return;
    this._dirty = true;
    for (const child of this._children) {
      child.markDirty();
    }
    // Propagate up so renderAll's isDirty check on roots works
    let p = this._parent;
    while (p && !p._dirty) {
      p._dirty = true;
      p = p._parent;
    }
  }

  updateLocalMatrix(): void {
    Mat4.fromRotationTranslationScale(this.localMatrix, this.rotation, this.position, this.scale);
  }

  updateWorldMatrix(): void {
    this.updateLocalMatrix();
    if (this._parent) {
      Mat4.multiply(this.worldMatrix, this._parent.worldMatrix, this.localMatrix);
    } else {
      this.worldMatrix.set(this.localMatrix);
    }
    this._dirty = false;
    for (const child of this._children) {
      child.updateWorldMatrix();
    }
  }

  get isDirty(): boolean {
    return this._dirty;
  }
}
