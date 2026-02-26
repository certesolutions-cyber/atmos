import type { Scene } from '@certe/atmos-core';
import { DirectionalLight } from './directional-light.js';
import { PointLight } from './point-light.js';
import { SpotLight } from './spot-light.js';

export const MAX_DIR_LIGHTS = 4;
export const MAX_POINT_LIGHTS = 4;
export const MAX_SPOT_LIGHTS = 4;

/**
 * GPU layout (592 bytes):
 *   cameraPos:    vec4<f32>                          16
 *   numDirLights: u32, numPointLights: u32,
 *     numSpotLights: u32, pad                        16
 *   dirLights:    array<DirLight, 4>  (32 each)     128
 *   pointLights:  array<PointLight, 4> (32 each)    128
 *   spotLights:   array<SpotLight, 4> (64 each)     256
 *   fogEnabled: u32, fogMode: u32, fogDensity, fogStart  16
 *   fogEnd, _pad, _pad2, _pad3                       16  (align fogColor to 16)
 *   fogColor: vec4<f32>                              16
 */
export const SCENE_UNIFORM_SIZE = 592;

export interface FogSettings {
  enabled: boolean;
  mode: 'linear' | 'exponential';
  density: number;
  start: number;
  end: number;
  color: Float32Array; // vec3 RGB
}

export interface LightSettings {
  direction: Float32Array; // normalized vec3, stored as vec4 (w=0)
  color: Float32Array;     // vec3 RGB, stored as vec4 (w=intensity)
  intensity: number;
}

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

export interface SceneLightData {
  dirCount: number;
  pointCount: number;
  spotCount: number;
  /** 4 × (dirX, dirY, dirZ, 0, colR, colG, colB, intensity) = 32 floats */
  dirLights: Float32Array;
  /** 4 × (posX, posY, posZ, range, colR, colG, colB, intensity) = 32 floats */
  pointLights: Float32Array;
  /** 4 × (posX, posY, posZ, range, dirX, dirY, dirZ, outerCos,
   *       colR, colG, colB, intensity, innerCos, pad, pad, pad) = 64 floats */
  spotLights: Float32Array;
  /** Component references for shadow pass selection (up to MAX per type). */
  dirComponents: DirectionalLight[];
  pointComponents: PointLight[];
  spotComponents: SpotLight[];
}

// Scratch arrays for collecting light data
const _dirBuf = new Float32Array(MAX_DIR_LIGHTS * 8);
const _pointBuf = new Float32Array(MAX_POINT_LIGHTS * 8);
const _spotBuf = new Float32Array(MAX_SPOT_LIGHTS * 16);
const _dirScratch = new Float32Array(3);
const _posScratch = new Float32Array(3);
const _spotDirScratch = new Float32Array(3);
const _spotPosScratch = new Float32Array(3);
const _dirComps: DirectionalLight[] = [];
const _pointComps: PointLight[] = [];
const _spotComps: SpotLight[] = [];

/** Gather DirectionalLight, PointLight, and SpotLight components from the scene. */
export function collectSceneLights(scene: Scene): SceneLightData {
  let dirCount = 0;
  let pointCount = 0;
  let spotCount = 0;
  _dirComps.length = 0;
  _pointComps.length = 0;
  _spotComps.length = 0;

  for (const obj of scene.getAllObjects()) {
    if (dirCount < MAX_DIR_LIGHTS) {
      const dl = obj.getComponent(DirectionalLight);
      if (dl && dl.enabled) {
        dl.getWorldDirection(_dirScratch);
        const off = dirCount * 8;
        _dirBuf[off] = _dirScratch[0]!;
        _dirBuf[off + 1] = _dirScratch[1]!;
        _dirBuf[off + 2] = _dirScratch[2]!;
        _dirBuf[off + 3] = 0;
        _dirBuf[off + 4] = dl.color[0]!;
        _dirBuf[off + 5] = dl.color[1]!;
        _dirBuf[off + 6] = dl.color[2]!;
        _dirBuf[off + 7] = dl.intensity;
        _dirComps.push(dl);
        dirCount++;
      }
    }
    if (pointCount < MAX_POINT_LIGHTS) {
      const pl = obj.getComponent(PointLight);
      if (pl && pl.enabled) {
        pl.getWorldPosition(_posScratch);
        const off = pointCount * 8;
        _pointBuf[off] = _posScratch[0]!;
        _pointBuf[off + 1] = _posScratch[1]!;
        _pointBuf[off + 2] = _posScratch[2]!;
        _pointBuf[off + 3] = pl.range;
        _pointBuf[off + 4] = pl.color[0]!;
        _pointBuf[off + 5] = pl.color[1]!;
        _pointBuf[off + 6] = pl.color[2]!;
        _pointBuf[off + 7] = pl.intensity;
        _pointComps.push(pl);
        pointCount++;
      }
    }
    if (spotCount < MAX_SPOT_LIGHTS) {
      const sl = obj.getComponent(SpotLight);
      if (sl && sl.enabled) {
        sl.getWorldPosition(_spotPosScratch);
        sl.getWorldDirection(_spotDirScratch);
        const off = spotCount * 16;
        _spotBuf[off] = _spotPosScratch[0]!;
        _spotBuf[off + 1] = _spotPosScratch[1]!;
        _spotBuf[off + 2] = _spotPosScratch[2]!;
        _spotBuf[off + 3] = sl.range;
        _spotBuf[off + 4] = _spotDirScratch[0]!;
        _spotBuf[off + 5] = _spotDirScratch[1]!;
        _spotBuf[off + 6] = _spotDirScratch[2]!;
        _spotBuf[off + 7] = Math.cos(sl.outerAngle);
        _spotBuf[off + 8] = sl.color[0]!;
        _spotBuf[off + 9] = sl.color[1]!;
        _spotBuf[off + 10] = sl.color[2]!;
        _spotBuf[off + 11] = sl.intensity;
        _spotBuf[off + 12] = Math.cos(sl.innerAngle);
        _spotBuf[off + 13] = 0;
        _spotBuf[off + 14] = 0;
        _spotBuf[off + 15] = 0;
        _spotComps.push(sl);
        spotCount++;
      }
    }
  }

  return {
    dirCount, pointCount, spotCount,
    dirLights: _dirBuf, pointLights: _pointBuf, spotLights: _spotBuf,
    dirComponents: _dirComps, pointComponents: _pointComps, spotComponents: _spotComps,
  };
}

/**
 * Write scene uniforms into a Float32Array for GPU upload.
 * Uses the new multi-light layout when SceneLightData is provided,
 * or falls back to single-light LightSettings for backwards compat.
 */
export function writeSceneUniforms(
  out: Float32Array,
  cameraPos: Float32Array,
  sceneLights?: SceneLightData,
  fallback?: LightSettings,
  fog?: FogSettings,
): void {
  // Zero everything first
  out.fill(0);

  // cameraPos (vec4, w=0)  — offset 0
  out[0] = cameraPos[0]!;
  out[1] = cameraPos[1]!;
  out[2] = cameraPos[2]!;
  out[3] = 0;

  if (sceneLights && (sceneLights.dirCount > 0 || sceneLights.pointCount > 0 || sceneLights.spotCount > 0)) {
    // Counts — offset 4 (as uint32 view): numDir, numPoint, numSpot
    const u32 = new Uint32Array(out.buffer, out.byteOffset + 16, 3);
    u32[0] = sceneLights.dirCount;
    u32[1] = sceneLights.pointCount;
    u32[2] = sceneLights.spotCount;

    // Dir lights — offset 8 (float index) = byte 32
    const dirFloatOffset = 8;
    for (let i = 0; i < sceneLights.dirCount * 8; i++) {
      out[dirFloatOffset + i] = sceneLights.dirLights[i]!;
    }

    // Point lights — offset 8 + 32 = 40 (float index) = byte 160
    const pointFloatOffset = dirFloatOffset + MAX_DIR_LIGHTS * 8;
    for (let i = 0; i < sceneLights.pointCount * 8; i++) {
      out[pointFloatOffset + i] = sceneLights.pointLights[i]!;
    }

    // Spot lights — offset 40 + 32 = 72 (float index) = byte 288
    const spotFloatOffset = pointFloatOffset + MAX_POINT_LIGHTS * 8;
    for (let i = 0; i < sceneLights.spotCount * 16; i++) {
      out[spotFloatOffset + i] = sceneLights.spotLights[i]!;
    }
  } else if (fallback) {
    // Single directional light fallback
    const u32 = new Uint32Array(out.buffer, out.byteOffset + 16, 3);
    u32[0] = 1;
    u32[1] = 0;
    u32[2] = 0;

    const dirFloatOffset = 8;
    out[dirFloatOffset] = fallback.direction[0]!;
    out[dirFloatOffset + 1] = fallback.direction[1]!;
    out[dirFloatOffset + 2] = fallback.direction[2]!;
    out[dirFloatOffset + 3] = 0;
    out[dirFloatOffset + 4] = fallback.color[0]!;
    out[dirFloatOffset + 5] = fallback.color[1]!;
    out[dirFloatOffset + 6] = fallback.color[2]!;
    out[dirFloatOffset + 7] = fallback.intensity;
  }

  // Fog data — float offset 136 (byte 544)
  // fogColor is vec4<f32> which requires 16-byte alignment → starts at byte 576 (float idx 144)
  if (fog) {
    const fogU32 = new Uint32Array(out.buffer, out.byteOffset + 544, 2);
    fogU32[0] = fog.enabled ? 1 : 0;
    fogU32[1] = fog.mode === 'exponential' ? 1 : 0;
    out[138] = fog.density;
    out[139] = fog.start;
    out[140] = fog.end;
    // float indices 141-143 are padding for vec4 alignment
    out[144] = fog.color[0]!;
    out[145] = fog.color[1]!;
    out[146] = fog.color[2]!;
    out[147] = 0; // pad
  }
}
