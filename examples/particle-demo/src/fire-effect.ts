import { Component } from '@certe/atmos-core';
import { ParticleEmitter } from '@certe/atmos-particles';

/**
 * FireEffect — script component that configures a sibling ParticleEmitter
 * for a rising flame effect.
 */
export class FireEffect extends Component {
  onStart(): void {
    const emitter = this.getComponent(ParticleEmitter);
    if (!emitter) return;

    emitter.emissionRate = 40;
    emitter.lifetimeMin = 0.5;
    emitter.lifetimeMax = 1.5;
    emitter.speedMin = 1;
    emitter.speedMax = 3;
    emitter.spread = 0.3;
    emitter.gravity = 1; // fire rises
    emitter.startSize = 0.3;
    emitter.endSize = 0.05;
    emitter.startColorR = 1;
    emitter.startColorG = 0.6;
    emitter.startColorB = 0.1;
    emitter.startAlpha = 1;
    emitter.endColorR = 1;
    emitter.endColorG = 0.1;
    emitter.endColorB = 0;
    emitter.endAlpha = 0;
  }
}
