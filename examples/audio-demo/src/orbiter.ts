import { Component } from '@certe/atmos-core';

/** Orbits the GameObject around the Y axis at a given radius and speed. */
export class Orbiter extends Component {
  radius = 5;
  speed = 1;
  height = 0;
  private _angle = 0;

  onUpdate(dt: number): void {
    this._angle += this.speed * dt;
    const x = Math.cos(this._angle) * this.radius;
    const z = Math.sin(this._angle) * this.radius;
    this.gameObject.transform.setPosition(x, this.height, z);
  }
}
