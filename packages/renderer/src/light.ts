export interface LightSettings {
  direction: Float32Array; // normalized vec3, stored as vec4 (w=0)
  color: Float32Array;     // vec3 RGB, stored as vec4 (w=intensity)
  intensity: number;
}

/** Bytes: vec4 lightDir(16) + vec4 lightColor(16) + vec4 cameraPos(16) = 48 */
export const SCENE_UNIFORM_SIZE = 48;

export function createDirectionalLight(
  direction?: [number, number, number],
  color?: [number, number, number],
  intensity?: number,
): LightSettings {
  const dir = direction ?? [-0.5, -1.0, -0.3];
  const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
  const inv = len > 0 ? 1 / len : 0;

  return {
    direction: new Float32Array([dir[0] * inv, dir[1] * inv, dir[2] * inv, 0]),
    color: new Float32Array(color ?? [1, 1, 1]),
    intensity: intensity ?? 1.0,
  };
}

/**
 * Write scene uniforms into a Float32Array for GPU upload.
 * Layout: vec4 lightDir | vec4 lightColor (w=intensity) | vec4 cameraPos (w=0)
 */
export function writeSceneUniforms(
  out: Float32Array,
  light: LightSettings,
  cameraPos: Float32Array,
): void {
  // lightDir (vec4, w=0)
  out[0] = light.direction[0]!;
  out[1] = light.direction[1]!;
  out[2] = light.direction[2]!;
  out[3] = 0;
  // lightColor (vec4, w=intensity)
  out[4] = light.color[0]!;
  out[5] = light.color[1]!;
  out[6] = light.color[2]!;
  out[7] = light.intensity;
  // cameraPos (vec4, w=0)
  out[8] = cameraPos[0]!;
  out[9] = cameraPos[1]!;
  out[10] = cameraPos[2]!;
  out[11] = 0;
}
