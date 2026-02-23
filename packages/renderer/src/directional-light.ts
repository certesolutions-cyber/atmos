import { Component } from '@atmos/core';

/**
 * Directional light component.
 * Direction is derived from the Transform's forward vector (negative Z axis in world space).
 */
export class DirectionalLight extends Component {
  color = new Float32Array([1, 1, 1]);
  intensity = 1.0;
  castShadows = false;
  shadowIntensity = 1.0;
  shadowResolution = 2048;
  /** Near cascade: ortho half-extent in world units. */
  shadowSize = 20;
  /** Near cascade: how far behind/ahead the light camera reaches. */
  shadowDistance = 50;
  /** Far cascade: ortho half-extent in world units. */
  shadowFarSize = 80;
  /** Far cascade: how far behind/ahead the light camera reaches. */
  shadowFarDistance = 200;

  /** Extract world direction (negated Z column of worldMatrix, normalized) into `out`. */
  getWorldDirection(out: Float32Array): Float32Array {
    const m = this.gameObject.transform.worldMatrix;
    // Column 2 = local Z axis in world space
    let x = m[8]!;
    let y = m[9]!;
    let z = m[10]!;
    const len = Math.sqrt(x * x + y * y + z * z);
    const inv = len > 0 ? 1 / len : 0;
    // Negate: light shines in -Z direction of the transform
    out[0] = -x * inv;
    out[1] = -y * inv;
    out[2] = -z * inv;
    return out;
  }
}
