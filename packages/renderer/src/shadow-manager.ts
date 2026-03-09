/**
 * ShadowManager — owns all shadow pass state and orchestrates multi-shadow
 * rendering for up to 2 dir, 2 point, and 4 spot shadow casters.
 */

import type { Scene } from '@certe/atmos-core';
import { Mat4 } from '@certe/atmos-math';
import type { Mat4Type } from '@certe/atmos-math';
import type { SceneLightData } from './light.js';
import { DirectionalLight } from './directional-light.js';
import { PointLight } from './point-light.js';
import { SpotLight } from './spot-light.js';
import { DirectionalShadowPassPair } from './shadow-pass.js';
import { PointShadowPass } from './point-shadow-pass.js';
import { SpotShadowPass } from './spot-shadow-pass.js';
import {
  SHADOW_UNIFORM_SIZE, MAX_DIR_SHADOW_SLOTS, MAX_POINT_SHADOW_SLOTS,
  MAX_SPOT_SHADOW_SLOTS, SHADOW_SLOT_NONE, createDummyShadowResources,
} from './shadow-uniforms.js';
import type { DummyShadowResources } from './shadow-uniforms.js';

export interface ShadowManagerResult { bindGroup: GPUBindGroup; }

const _posScratch = new Float32Array(3);
const _spotDirScratch = new Float32Array(3);
const _dirLightDirScratch = new Float32Array(3);

interface LightDist<T> { light: T; dist2: number; }
const _pointCandidates: LightDist<PointLight>[] = [];
const _spotCandidates: LightDist<SpotLight>[] = [];

interface DirCandidate { light: DirectionalLight; intensity: number; }
const _dirCandidates: DirCandidate[] = [];

export class ShadowManager {
  private readonly _device: GPUDevice;
  private readonly _objectBGL: GPUBindGroupLayout;
  private readonly _shadowBGL: GPUBindGroupLayout;
  private _dirPairs: (DirectionalShadowPassPair | null)[] = [null, null];
  private _pointPasses: (PointShadowPass | null)[] = [null, null];
  private _spotPasses: (SpotShadowPass | null)[] = [null, null, null, null];
  private _uniformBuffer: GPUBuffer | null = null;
  private readonly _uniformData = new ArrayBuffer(SHADOW_UNIFORM_SIZE);
  private _bindGroup: GPUBindGroup | null = null;
  private _dummy: DummyShadowResources | null = null;
  private _dirty = true;
  private readonly _dirSlotLights: (DirectionalLight | null)[] = [null, null];
  private readonly _pointSlotLights: (PointLight | null)[] = [null, null];
  private readonly _spotSlotLights: (SpotLight | null)[] = [null, null, null, null];
  private readonly _dirVP0: Mat4Type[] = Array.from({ length: MAX_DIR_SHADOW_SLOTS }, () => Mat4.create());
  private readonly _dirVP1: Mat4Type[] = Array.from({ length: MAX_DIR_SHADOW_SLOTS }, () => Mat4.create());

  constructor(device: GPUDevice, objectBGL: GPUBindGroupLayout, shadowBGL: GPUBindGroupLayout) {
    this._device = device;
    this._objectBGL = objectBGL;
    this._shadowBGL = shadowBGL;
  }

  update(
    encoder: GPUCommandEncoder, scene: Scene, cameraEye: Float32Array,
    sceneLights: SceneLightData,
    extraDraw: ((pass: GPURenderPassEncoder) => void) | undefined,
    computeCascadeVP: (out: Mat4Type, light: DirectionalLight, eye: Float32Array, size: number, dist: number) => void,
  ): ShadowManagerResult {
    if (!this._dummy) this._dummy = createDummyShadowResources(this._device, this._shadowBGL);

    const dirSlots = this._selectDirLights(sceneLights);
    const pointSlots = this._selectClosest(sceneLights.pointComponents, sceneLights.pointCount, cameraEye, MAX_POINT_SHADOW_SLOTS, _pointCandidates);
    const spotSlots = this._selectClosest(sceneLights.spotComponents, sceneLights.spotCount, cameraEye, MAX_SPOT_SHADOW_SLOTS, _spotCandidates);

    this._syncDirPasses(dirSlots);
    this._syncPointPasses(pointSlots);
    this._syncSpotPasses(spotSlots);
    this._executeDirPasses(encoder, scene, dirSlots, cameraEye, extraDraw, computeCascadeVP);
    this._executePointPasses(encoder, scene, pointSlots, extraDraw);
    this._executeSpotPasses(encoder, scene, spotSlots, extraDraw);
    this._writeUniforms(dirSlots, pointSlots, spotSlots, sceneLights);

    if (this._dirty) { this._buildBindGroup(); this._dirty = false; }
    return { bindGroup: this._bindGroup! };
  }

  /** Select up to MAX_DIR_SHADOW_SLOTS dir lights by highest intensity. */
  private _selectDirLights(sceneLights: SceneLightData): (DirectionalLight | null)[] {
    _dirCandidates.length = 0;
    for (let i = 0; i < sceneLights.dirCount; i++) {
      const dl = sceneLights.dirComponents[i]!;
      if (dl.castShadows) _dirCandidates.push({ light: dl, intensity: dl.intensity });
    }
    _dirCandidates.sort((a, b) => b.intensity - a.intensity);
    const result: (DirectionalLight | null)[] = new Array(MAX_DIR_SHADOW_SLOTS).fill(null);
    for (let s = 0; s < MAX_DIR_SHADOW_SLOTS && s < _dirCandidates.length; s++) {
      result[s] = _dirCandidates[s]!.light;
    }
    return result;
  }

  private _selectClosest<T extends { castShadows: boolean; getWorldPosition(out: Float32Array): Float32Array }>(
    components: T[], count: number, cameraEye: Float32Array, maxSlots: number, buf: LightDist<T>[],
  ): (T | null)[] {
    buf.length = 0;
    const cx = cameraEye[0]!, cy = cameraEye[1]!, cz = cameraEye[2]!;
    for (let i = 0; i < count; i++) {
      const c = components[i]!;
      if (!c.castShadows) continue;
      c.getWorldPosition(_posScratch);
      const dx = _posScratch[0]! - cx, dy = _posScratch[1]! - cy, dz = _posScratch[2]! - cz;
      buf.push({ light: c, dist2: dx * dx + dy * dy + dz * dz });
    }
    buf.sort((a, b) => a.dist2 - b.dist2);
    const result: (T | null)[] = new Array(maxSlots).fill(null);
    for (let s = 0; s < maxSlots && s < buf.length; s++) result[s] = buf[s]!.light;
    return result;
  }

  /* ── pass lifecycle ───────────────────────────────────────────── */

  private _syncSlot<TLight, TPass extends { destroy(): void }>(
    i: number, want: TLight | null, passes: (TPass | null)[], slotLights: (TLight | null)[],
    create: () => TPass,
  ): void {
    if (want && !passes[i]) { passes[i] = create(); this._dirty = true; }
    else if (!want && passes[i]) { passes[i]!.destroy(); passes[i] = null; this._dirty = true; }
    if (slotLights[i] !== want) { slotLights[i] = want; this._dirty = true; }
  }

  private _syncDirPasses(slots: (DirectionalLight | null)[]): void {
    for (let i = 0; i < MAX_DIR_SHADOW_SLOTS; i++)
      this._syncSlot(i, slots[i], this._dirPairs, this._dirSlotLights,
        () => new DirectionalShadowPassPair(this._device, this._objectBGL, slots[i]!.shadowResolution));
  }
  private _syncPointPasses(slots: (PointLight | null)[]): void {
    for (let i = 0; i < MAX_POINT_SHADOW_SLOTS; i++)
      this._syncSlot(i, slots[i], this._pointPasses, this._pointSlotLights,
        () => new PointShadowPass(this._device, this._objectBGL, slots[i]!.shadowResolution));
  }
  private _syncSpotPasses(slots: (SpotLight | null)[]): void {
    for (let i = 0; i < MAX_SPOT_SHADOW_SLOTS; i++)
      this._syncSlot(i, slots[i], this._spotPasses, this._spotSlotLights,
        () => new SpotShadowPass(this._device, this._objectBGL, slots[i]!.shadowResolution));
  }

  /* ── pass execution ───────────────────────────────────────────── */

  private _executeDirPasses(
    enc: GPUCommandEncoder, scene: Scene, slots: (DirectionalLight | null)[],
    eye: Float32Array, extra: ((p: GPURenderPassEncoder) => void) | undefined,
    cascadeVP: (out: Mat4Type, l: DirectionalLight, e: Float32Array, s: number, d: number) => void,
  ): void {
    for (let i = 0; i < MAX_DIR_SHADOW_SLOTS; i++) {
      const dl = slots[i]; const pair = this._dirPairs[i];
      if (!dl || !pair) continue;
      cascadeVP(this._dirVP0[i]!, dl, eye, dl.shadowSize, dl.shadowDistance);
      cascadeVP(this._dirVP1[i]!, dl, eye, dl.shadowFarSize, dl.shadowFarDistance);
      pair.execute(enc, scene, this._dirVP0[i]!, this._dirVP1[i]!, extra);
    }
  }

  private _executePointPasses(
    enc: GPUCommandEncoder, scene: Scene, slots: (PointLight | null)[],
    extra: ((p: GPURenderPassEncoder) => void) | undefined,
  ): void {
    for (let i = 0; i < MAX_POINT_SHADOW_SLOTS; i++) {
      const pl = slots[i]; const pass = this._pointPasses[i];
      if (!pl || !pass) continue;
      pl.getWorldPosition(_posScratch);
      pass.execute(enc, scene, _posScratch, pl.range, extra);
    }
  }

  private _executeSpotPasses(
    enc: GPUCommandEncoder, scene: Scene, slots: (SpotLight | null)[],
    extra: ((p: GPURenderPassEncoder) => void) | undefined,
  ): void {
    for (let i = 0; i < MAX_SPOT_SHADOW_SLOTS; i++) {
      const sl = slots[i]; const pass = this._spotPasses[i];
      if (!sl || !pass) continue;
      sl.getWorldPosition(_posScratch);
      sl.getWorldDirection(_spotDirScratch);
      pass.execute(enc, scene, _posScratch, _spotDirScratch, sl.outerAngle, sl.range, extra);
    }
  }

  /* ── uniform buffer ───────────────────────────────────────────── */

  private _writeUniforms(
    dirSlots: (DirectionalLight | null)[], pointSlots: (PointLight | null)[],
    spotSlots: (SpotLight | null)[], sceneLights: SceneLightData,
  ): void {
    const f32 = new Float32Array(this._uniformData);
    const u32 = new Uint32Array(this._uniformData);
    f32.fill(0);

    // DirShadowSlot[2]: offset 0, 176B each = 44 floats each
    for (let i = 0; i < MAX_DIR_SHADOW_SLOTS; i++) {
      const dl = dirSlots[i]; if (!dl) continue;
      const b = i * 44;
      f32.set(this._dirVP0[i]! as Float32Array, b);
      f32.set(this._dirVP1[i]! as Float32Array, b + 16);
      f32[b + 32] = 0.002; u32[b + 33] = 1; f32[b + 34] = dl.shadowIntensity;
      f32[b + 35] = dl.shadowSize * 0.85; f32[b + 36] = dl.shadowSize * 0.5;
      f32[b + 37] = dl.shadowSize * 2.0;       // orthoSize0 (cascade 0 world width)
      f32[b + 38] = dl.shadowFarSize * 2.0;    // orthoSize1 (cascade 1 world width)
      dl.getWorldDirection(_dirLightDirScratch);
      f32[b + 39] = _dirLightDirScratch[0]!;   // lightDirX
      f32[b + 40] = _dirLightDirScratch[1]!;   // lightDirY
      f32[b + 41] = _dirLightDirScratch[2]!;   // lightDirZ
    }
    // PointShadowSlot[2]: offset 352B = 88 floats, 32B each = 8 floats each
    for (let i = 0; i < MAX_POINT_SHADOW_SLOTS; i++) {
      const pl = pointSlots[i]; if (!pl) continue;
      const b = 88 + i * 8;
      pl.getWorldPosition(_posScratch);
      f32[b] = _posScratch[0]!; f32[b + 1] = _posScratch[1]!;
      f32[b + 2] = _posScratch[2]!; f32[b + 3] = pl.range;
      f32[b + 4] = 0.007; u32[b + 5] = 1; f32[b + 6] = pl.shadowIntensity;
    }
    // SpotShadowSlot[4]: offset 416B = 104 floats, 96B each = 24 floats each
    for (let i = 0; i < MAX_SPOT_SHADOW_SLOTS; i++) {
      const sl = spotSlots[i]; if (!sl) continue;
      const b = 104 + i * 24;
      const pass = this._spotPasses[i];
      if (pass) f32.set(pass.getViewProjection() as Float32Array, b);
      sl.getWorldPosition(_posScratch);
      f32[b + 16] = _posScratch[0]!; f32[b + 17] = _posScratch[1]!;
      f32[b + 18] = _posScratch[2]!; f32[b + 19] = sl.range;
      f32[b + 20] = 0.002; u32[b + 21] = 1; f32[b + 22] = sl.shadowIntensity;
    }

    // Light-to-slot maps: offset 800B = float index 200
    const m = 200;
    for (let i = 0; i < 12; i++) u32[m + i] = SHADOW_SLOT_NONE;
    this._writeSlotMap(u32, m, dirSlots, sceneLights.dirComponents, sceneLights.dirCount, MAX_DIR_SHADOW_SLOTS);
    this._writeSlotMap(u32, m + 4, pointSlots, sceneLights.pointComponents, sceneLights.pointCount, MAX_POINT_SHADOW_SLOTS);
    this._writeSlotMap(u32, m + 8, spotSlots, sceneLights.spotComponents, sceneLights.spotCount, MAX_SPOT_SHADOW_SLOTS);

    if (!this._uniformBuffer) {
      this._uniformBuffer = this._device.createBuffer({
        size: SHADOW_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._dirty = true;
    }
    this._device.queue.writeBuffer(this._uniformBuffer, 0, this._uniformData as GPUAllowSharedBufferSource);
  }

  private _writeSlotMap<T>(
    u32: Uint32Array, base: number, slots: (T | null)[],
    components: T[], count: number, maxSlots: number,
  ): void {
    for (let slot = 0; slot < maxSlots; slot++) {
      if (!slots[slot]) continue;
      for (let li = 0; li < count; li++) {
        if (components[li] === slots[slot]) { u32[base + li] = slot; break; }
      }
    }
  }

  /* ── bind group ───────────────────────────────────────────────── */

  private _buildBindGroup(): void {
    const d = this._dummy!;
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this._uniformBuffer! } },
      { binding: 1, resource: d.sampler },
    ];
    // 2–3: dir cascade 0
    for (let i = 0; i < MAX_DIR_SHADOW_SLOTS; i++)
      entries.push({ binding: 2 + i, resource: this._dirPairs[i]?.cascade0View ?? d.dummy2DView });
    // 4–5: dir cascade 1
    for (let i = 0; i < MAX_DIR_SHADOW_SLOTS; i++)
      entries.push({ binding: 4 + i, resource: this._dirPairs[i]?.cascade1View ?? d.dummy2DView });
    // 6–7: point cubemaps
    for (let i = 0; i < MAX_POINT_SHADOW_SLOTS; i++)
      entries.push({ binding: 6 + i, resource: this._pointPasses[i]?.cubeMapView ?? d.dummyCubeView });
    // 8–11: spot depth maps
    for (let i = 0; i < MAX_SPOT_SHADOW_SLOTS; i++)
      entries.push({ binding: 8 + i, resource: this._spotPasses[i]?.shadowMapView ?? d.dummy2DView });
    this._bindGroup = this._device.createBindGroup({ layout: this._shadowBGL, entries });
  }

  destroy(): void {
    for (const p of this._dirPairs) p?.destroy();
    for (const p of this._pointPasses) p?.destroy();
    for (const p of this._spotPasses) p?.destroy();
    this._uniformBuffer?.destroy();
  }
}
