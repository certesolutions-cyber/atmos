/**
 * TreeBrush: paint/erase tool for placing trees on terrain.
 *
 * Used by the editor to brush-paint trees at terrain-intersected positions.
 */

import type { TreeBrushConfig } from './types.js';
import { DEFAULT_TREE_BRUSH_CONFIG } from './types.js';
import type { TreeSystem } from './tree-system.js';
import { mulberry32 } from './lsystem.js';

export type HeightFn = (x: number, z: number) => number;

export class TreeBrush {
  config: TreeBrushConfig = { ...DEFAULT_TREE_BRUSH_CONFIG };

  private _strokeSeed = 0;

  /**
   * Perform a brush stroke at (worldX, worldZ).
   *
   * In paint mode: scatter trees within radius using rejection sampling.
   * In erase mode: remove trees within radius.
   */
  stroke(treeSystem: TreeSystem, worldX: number, worldZ: number, heightFn: HeightFn): void {
    if (this.config.eraseMode) {
      treeSystem.removeTreesInRadius(worldX, worldZ, this.config.radius);
      return;
    }

    // Paint mode: scatter trees with minimum spacing
    const { radius, density, speciesIndex, scaleMin, scaleMax } = this.config;
    const area = Math.PI * radius * radius;
    const count = Math.max(1, Math.floor(area * density * 0.01));

    // Minimum spacing derived from density — higher density = smaller spacing
    const minDist = 1 / Math.max(density, 0.01);
    const minDist2 = minDist * minDist;

    this._strokeSeed++;
    const rand = mulberry32(this._strokeSeed * 31337);

    // Gather existing instances from ALL species for proximity check
    const speciesCount = treeSystem.speciesCount;
    const existingInstances: Array<{ x: number; z: number }> = [];
    for (let s = 0; s < speciesCount; s++) {
      for (const inst of treeSystem.getInstances(s)) {
        // Only check trees near the brush stroke (broad filter)
        const dx = inst.x - worldX;
        const dz = inst.z - worldZ;
        if (dx * dx + dz * dz < (radius + minDist) * (radius + minDist)) {
          existingInstances.push(inst);
        }
      }
    }

    for (let i = 0; i < count; i++) {
      // Rejection sampling within circle
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

      // Skip if too close to any existing tree
      let tooClose = false;
      for (const inst of existingInstances) {
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

      treeSystem.addTree(speciesIndex, x, y, z, rotY, scale);
      // Track newly placed tree for subsequent proximity checks within this stroke
      existingInstances.push({ x, z });
    }
  }
}
