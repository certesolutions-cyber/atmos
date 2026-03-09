/**
 * L-system string expansion with seeded PRNG for stochastic rules.
 *
 * Symbols:
 *   F  – move forward, draw cylinder segment
 *   +/- – yaw ±branchAngle
 *   &/^ – pitch ±branchAngle
 *   \/  / – roll ±branchAngle
 *   [/] – push/pop turtle state
 *   A  – growth point (replaced by rules)
 *   L  – leaf placement marker
 */

import type { LSystemRule, TreeSpeciesConfig } from './types.js';

/**
 * Mulberry32 seeded PRNG. Returns a function that produces [0, 1) on each call.
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Expand an L-system axiom by applying rules for the given number of iterations.
 *
 * When multiple rules share the same symbol, one is chosen stochastically
 * using normalized probability weights.
 */
export function expandLSystem(
  axiom: string,
  rules: LSystemRule[],
  iterations: number,
  seed: number,
): string {
  const rand = mulberry32(seed);

  // Group rules by symbol for fast lookup
  const ruleMap = new Map<string, LSystemRule[]>();
  for (const rule of rules) {
    let group = ruleMap.get(rule.symbol);
    if (!group) {
      group = [];
      ruleMap.set(rule.symbol, group);
    }
    group.push(rule);
  }

  let current = axiom;

  for (let iter = 0; iter < iterations; iter++) {
    let next = '';
    for (let i = 0; i < current.length; i++) {
      const ch = current[i]!;
      const group = ruleMap.get(ch);
      if (!group) {
        next += ch;
        continue;
      }

      if (group.length === 1) {
        next += group[0]!.replacement;
        continue;
      }

      // Stochastic selection: normalize probabilities
      let totalWeight = 0;
      for (const r of group) {
        totalWeight += r.probability ?? 1.0;
      }

      const roll = rand() * totalWeight;
      let cumulative = 0;
      let chosen = group[0]!;
      for (const r of group) {
        cumulative += r.probability ?? 1.0;
        if (roll < cumulative) {
          chosen = r;
          break;
        }
      }
      next += chosen.replacement;
    }
    current = next;
  }

  return current;
}

/**
 * Recursively build a pre-expanded lateral branch string for excurrent mode.
 * Uses 'G' symbol (short forward step) instead of 'F'.
 * depth=0 → 'GL', depth=1 → 'G[+GL][-GL]L', depth=2 → 'G[+G[+GL][-GL]L][-G[+GL][-GL]L]L', etc.
 */
function buildExcurrentBranch(depth: number): string {
  if (!Number.isFinite(depth) || depth <= 0) return 'GL';
  const sub = buildExcurrentBranch(depth - 1);
  return `G[+${sub}][-${sub}]L`;
}

/**
 * Resolve the effective axiom and rules for a species config.
 *
 * For 'decurrent' mode, returns the config's own axiom/rules unchanged.
 * For 'excurrent' mode, generates monopodial rules where a central leader (A)
 * persists and lateral branches (B) grow off at the configured branchAngle.
 */
export function resolveSpeciesRules(config: TreeSpeciesConfig): { axiom: string; rules: LSystemRule[] } {
  if (config.branchMode !== 'excurrent') {
    return { axiom: config.axiom, rules: config.rules };
  }

  // Excurrent (monopodial): strong central trunk with whorls of lateral branches.
  // Branches are pre-expanded to `excurrentBranchIterations` depth using G (short step),
  // so L-system `iterations` only controls trunk height / whorl count.
  const branch = buildExcurrentBranch(config.excurrentBranchIterations ?? 2);
  return {
    axiom: 'FFA',
    rules: [
      // Trunk: grow one segment, sprout 4 lateral branches in a cross, continue leader
      { symbol: 'A', replacement: `F[&+${branch}][&-${branch}][^+${branch}][^-${branch}]A` },
    ],
  };
}
