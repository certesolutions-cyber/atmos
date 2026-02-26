import { Component } from '@certe/atmos-core';

/**
 * Point light component.
 * Position is derived from the Transform's world position (worldMatrix[12..14]).
 */
export class PointLight extends Component {
  color = new Float32Array([1, 1, 1]);
  intensity = 1.0;
  range = 10.0;
  castShadows = false;
  shadowIntensity = 1.0;
  shadowResolution = 512;

  /** Extract world position into `out`. */
  getWorldPosition(out: Float32Array): Float32Array {
    const m = this.gameObject.transform.worldMatrix;
    out[0] = m[12]!;
    out[1] = m[13]!;
    out[2] = m[14]!;
    return out;
  }
}
