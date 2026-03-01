import { Component } from '@certe/atmos-core';
import { ParticleEmitter } from '@certe/atmos-particles';

/**
 * SparkEffect — script component that configures a sibling ParticleEmitter
 * for a gravity-pulled spark shower.
 */
export class SparkEffect extends Component {
  onStart(): void {
    const emitter = this.getComponent(ParticleEmitter);
    if (!emitter) return;

    emitter.emissionRate = 20;
    emitter.lifetimeMin = 0.8;
    emitter.lifetimeMax = 2;
    emitter.speedMin = 3;
    emitter.speedMax = 6;
    emitter.spread = 0.8;
    emitter.gravity = -4;
    emitter.startSize = 0.08;
    emitter.endSize = 0.02;
    emitter.startColorR = 1;
    emitter.startColorG = 0.9;
    emitter.startColorB = 0.5;
    emitter.startAlpha = 1;
    emitter.endColorR = 1;
    emitter.endColorG = 0.3;
    emitter.endColorB = 0;
    emitter.endAlpha = 0;
  }
}
