import { Component } from '@certe/atmos-core';
import { ParticleEmitter } from '@certe/atmos-particles';

/**
 * DustEffect — script component that configures a sibling ParticleEmitter
 * for slow, omnidirectional ambient dust.
 */
export class DustEffect extends Component {
  onStart(): void {
    const emitter = this.getComponent(ParticleEmitter);
    if (!emitter) return;

    emitter.emissionRate = 8;
    emitter.lifetimeMin = 2;
    emitter.lifetimeMax = 5;
    emitter.speedMin = 0.2;
    emitter.speedMax = 0.8;
    emitter.spread = Math.PI; // emit in all directions
    emitter.gravity = 0.1; // slight upward drift
    emitter.startSize = 0.15;
    emitter.endSize = 0.3;
    emitter.startColorR = 0.6;
    emitter.startColorG = 0.6;
    emitter.startColorB = 0.7;
    emitter.startAlpha = 0.5;
    emitter.endColorR = 0.5;
    emitter.endColorG = 0.5;
    emitter.endColorB = 0.6;
    emitter.endAlpha = 0;
    emitter.rotationSpeedMin = -1;
    emitter.rotationSpeedMax = 1;
  }
}
