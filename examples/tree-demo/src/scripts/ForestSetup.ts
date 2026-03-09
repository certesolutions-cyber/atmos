/**
 * ForestSetup script: creates a TreeSystem with multiple species variants
 * and scatters a mix of them across the scene.
 */

import { Component, registerComponent } from '@certe/atmos-core';
import { RenderSystem } from '@certe/atmos-renderer';
import {
  TreeSystem,
  createTreePipeline,
  DEFAULT_TREE_SPECIES_CONFIG,
} from '@certe/atmos-trees';
import type { TreeSpeciesConfig } from '@certe/atmos-trees';

/**
 * Each variant overrides select fields from the base config.
 * The seed is the most important — it changes the PRNG so the L-system
 * expands differently and the turtle curvature varies, producing
 * a visually distinct tree from the same grammar.
 */
const VARIANTS: Partial<TreeSpeciesConfig>[] = [
  {
    name: 'oak-wide',
    axiom: 'FFA',
    rules: [
      { symbol: 'A', replacement: 'F[+FA][-FA][&FA][^FA]L' },
    ],
    iterations: 3,
    branchAngle: 35,
    angleVariance: 12,
    trunkRadius: 0.18,
    radiusTaper: 0.55,
    segmentLength: 0.7,
    curvature: 0.08,
    leafCount: 6,
    leafWidth: 1.6,
    leafHeight: 1.4,
    seed: 101,
  },
  {
    name: 'pine-tall',
    axiom: 'FFFA',
    rules: [
      { symbol: 'A', replacement: 'F[+FA][-FA]L' },
    ],
    iterations: 4,
    branchAngle: 22,
    angleVariance: 5,
    trunkRadius: 0.10,
    radiusTaper: 0.70,
    segmentLength: 0.9,
    curvature: 0.03,
    leafCount: 4,
    leafWidth: 1.2,
    leafHeight: 1.0,
    seed: 202,
  },
  {
    name: 'birch-slim',
    axiom: 'FFA',
    rules: [
      { symbol: 'A', replacement: 'FF[+FA][-FA]L', probability: 0.7 },
      { symbol: 'A', replacement: 'F[&FA][^FA]L', probability: 0.3 },
    ],
    iterations: 3,
    branchAngle: 28,
    angleVariance: 10,
    trunkRadius: 0.08,
    radiusTaper: 0.60,
    segmentLength: 1.0,
    curvature: 0.06,
    leafCount: 5,
    leafWidth: 1.0,
    leafHeight: 1.2,
    seed: 303,
  },
  {
    name: 'bush-low',
    axiom: 'FA',
    rules: [
      { symbol: 'A', replacement: '[+FA][-FA][&FA][^FA]L' },
    ],
    iterations: 3,
    branchAngle: 40,
    angleVariance: 15,
    trunkRadius: 0.06,
    radiusTaper: 0.50,
    segmentLength: 0.5,
    curvature: 0.10,
    leafCount: 7,
    leafWidth: 1.8,
    leafHeight: 1.6,
    seed: 404,
  },
];

export class ForestSetup extends Component {
  treeCount = 80;
  spreadRadius = 40;

  private _treeSystem: TreeSystem | null = null;

  onAwake(): void {
    // Skip if already initialized with species (e.g. re-entering play mode)
    const existing = this.gameObject.getComponent(TreeSystem);
    if (existing && existing.speciesCount > 0) {
      this._treeSystem = existing;
      return;
    }

    const rs = RenderSystem.current;
    if (!rs) {
      console.warn('[ForestSetup] No RenderSystem available');
      return;
    }

    const device = rs.device;
    const pipeline = createTreePipeline(device);

    // Reuse existing empty TreeSystem (e.g. deserialized) or create new one
    const ts = existing ?? this.gameObject.addComponent(TreeSystem);

    // Save any deserialized texture paths before init overwrites them
    const savedBark: string[] = [];
    const savedLeaf: string[] = [];
    for (let i = 0; i < VARIANTS.length; i++) {
      savedBark.push(ts.getBarkTextureSource(i));
      savedLeaf.push(ts.getLeafTextureSource(i));
    }

    ts.init(device, pipeline);

    // Register all species variants
    for (const variant of VARIANTS) {
      const species: TreeSpeciesConfig = {
        ...DEFAULT_TREE_SPECIES_CONFIG,
        ...variant,
      };
      ts.addSpecies(species);
    }

    // Restore deserialized texture paths now that species exist
    for (let i = 0; i < VARIANTS.length; i++) {
      if (savedBark[i]) ts.setBarkTextureSource(i, savedBark[i]!);
      if (savedLeaf[i]) ts.setLeafTextureSource(i, savedLeaf[i]!);
    }

    // Apply pending instances from deserialized scene data, or generate fresh ones
    ts.applyPendingInstances();
    const hasInstances = ts.getInstances(0).length > 0;

    if (!hasInstances) {
      // No saved instances — scatter trees procedurally
      const rand = (s: number) => {
        let x = s;
        return () => {
          x = (x * 1103515245 + 12345) & 0x7FFFFFFF;
          return x / 0x7FFFFFFF;
        };
      };
      const r = rand(42);
      const speciesCount = VARIANTS.length;

      for (let i = 0; i < this.treeCount; i++) {
        const angle = r() * Math.PI * 2;
        const dist = Math.sqrt(r()) * this.spreadRadius;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const scale = 0.7 + r() * 0.6;
        const speciesIdx = Math.floor(r() * speciesCount);
        ts.addTree(speciesIdx, x, 0, z, undefined, scale);
      }
      console.log(`[ForestSetup] Generated ${this.treeCount} trees across ${speciesCount} species`);
    } else {
      console.log(`[ForestSetup] Restored saved tree instances`);
    }

    this._treeSystem = ts;
  }
}

registerComponent(ForestSetup, {
  name: 'ForestSetup',
  properties: [
    { key: 'treeCount', type: 'number', min: 1, max: 500, step: 1 },
    { key: 'spreadRadius', type: 'number', min: 5, max: 200, step: 5 },
  ],
});
