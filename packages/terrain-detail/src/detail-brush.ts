/**
 * DetailBrush: paint/erase tool for placing detail billboards on terrain.
 */

import type { DetailBrushConfig } from './types.js';
import { DEFAULT_DETAIL_BRUSH_CONFIG } from './types.js';
import type { DetailSystem } from './detail-system.js';

export type HeightFn = (x: number, z: number) => number;

/** Simple seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DetailBrush {
  config: DetailBrushConfig = { ...DEFAULT_DETAIL_BRUSH_CONFIG };

  private _strokeSeed = 0;

  stroke(detailSystem: DetailSystem, worldX: number, worldZ: number, heightFn: HeightFn): void {
    if (this.config.eraseMode) {
      detailSystem.removeDetailsInRadius(worldX, worldZ, this.config.radius);
      return;
    }

    const { radius, density, typeIndex, scaleMin, scaleMax } = this.config;
    const area = Math.PI * radius * radius;
    const count = Math.max(1, Math.floor(area * density * 0.1));

    // Minimum spacing — detail is denser than trees but still needs some
    const minDist = 0.3 / Math.max(density, 0.01);
    const minDist2 = minDist * minDist;

    this._strokeSeed++;
    const rand = mulberry32(this._strokeSeed * 51749);

    // Only check proximity within this type for performance (detail is cheap/overlapping)
    const existing = detailSystem.getInstances(typeIndex);
    const nearExisting: Array<{ x: number; z: number }> = [];
    for (const inst of existing) {
      const dx = inst.x - worldX;
      const dz = inst.z - worldZ;
      if (dx * dx + dz * dz < (radius + minDist) * (radius + minDist)) {
        nearExisting.push(inst);
      }
    }

    for (let i = 0; i < count; i++) {
      let x: number, z: number;
      let attempts = 0;
      do {
        x = worldX + (rand() * 2 - 1) * radius;
        z = worldZ + (rand() * 2 - 1) * radius;
        attempts++;
      } while (
        (x - worldX) * (x - worldX) + (z - worldZ) * (z - worldZ) > radius * radius
        && attempts < 10
      );

      if (attempts >= 10) continue;

      // Proximity check
      let tooClose = false;
      for (const inst of nearExisting) {
        const dx = x - inst.x;
        const dz = z - inst.z;
        if (dx * dx + dz * dz < minDist2) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const y = heightFn(x, z);
      const scale = scaleMin + rand() * (scaleMax - scaleMin);
      const rotY = rand() * Math.PI * 2;
      const colorShift = rand() * 2 - 1;

      detailSystem.addDetail(typeIndex, x, y, z, rotY, scale, colorShift);
      nearExisting.push({ x, z });
    }
  }
}
