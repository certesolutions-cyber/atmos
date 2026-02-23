import { Component } from '@atmos/core';

/**
 * Spot light component.
 * Position is derived from Transform's world position (worldMatrix[12..14]).
 * Direction is derived from Transform's forward vector (-Z in world space).
 * innerAngle / outerAngle are half-angles in radians (max outerAngle = 60deg = 120deg full cone).
 */
export class SpotLight extends Component {
  color = new Float32Array([1, 1, 1]);
  intensity = 1.0;
  range = 10.0;
  /** Half-angle of the inner (full-brightness) cone in radians. Default ~25deg. */
  innerAngle = 25 * Math.PI / 180;
  /** Half-angle of the outer (falloff) cone in radians. Default ~35deg, max 60deg. */
  outerAngle = 35 * Math.PI / 180;
  castShadows = false;
  shadowIntensity = 1.0;
  shadowResolution = 1024;

  /** Extract world position into `out`. */
  getWorldPosition(out: Float32Array): Float32Array {
    const m = this.gameObject.transform.worldMatrix;
    out[0] = m[12]!;
    out[1] = m[13]!;
    out[2] = m[14]!;
    return out;
  }

  /** Extract world direction (negated Z column of worldMatrix, normalized) into `out`. */
  getWorldDirection(out: Float32Array): Float32Array {
    const m = this.gameObject.transform.worldMatrix;
    let x = m[8]!;
    let y = m[9]!;
    let z = m[10]!;
    const len = Math.sqrt(x * x + y * y + z * z);
    const inv = len > 0 ? 1 / len : 0;
    out[0] = -x * inv;
    out[1] = -y * inv;
    out[2] = -z * inv;
    return out;
  }
}
