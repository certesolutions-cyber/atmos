import { Component } from '@atmos/core';

export class Rotator extends Component {
  speed = 1;

  static editorProperties = [
    { name: 'speed', type: 'number' as const, default: 1 },
  ];

  update(): void {
    const dt = this.gameObject.scene?.time?.deltaTime ?? 0.016;
    this.transform.rotation[1] += this.speed * dt;
    this.transform.markDirty();
  }
}
