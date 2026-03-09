import { describe, it, expect } from 'vitest';
import { expandLSystem, mulberry32, resolveSpeciesRules } from '../lsystem.js';
import { DEFAULT_TREE_SPECIES_CONFIG } from '../types.js';

describe('mulberry32', () => {
  it('produces deterministic values for same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('expandLSystem', () => {
  it('returns axiom unchanged with 0 iterations', () => {
    const result = expandLSystem('FFA', [{ symbol: 'A', replacement: 'FB' }], 0, 1);
    expect(result).toBe('FFA');
  });

  it('applies simple rule once', () => {
    const result = expandLSystem('A', [{ symbol: 'A', replacement: 'FB' }], 1, 1);
    expect(result).toBe('FB');
  });

  it('preserves symbols without rules', () => {
    const result = expandLSystem('F+F', [{ symbol: 'A', replacement: 'X' }], 1, 1);
    expect(result).toBe('F+F');
  });

  it('handles multi-iteration expansion', () => {
    // A → AB, B → A
    const rules = [
      { symbol: 'A', replacement: 'AB' },
      { symbol: 'B', replacement: 'A' },
    ];
    // iter 0: A
    // iter 1: AB
    // iter 2: ABA
    // iter 3: ABAAB
    expect(expandLSystem('A', rules, 1, 1)).toBe('AB');
    expect(expandLSystem('A', rules, 2, 1)).toBe('ABA');
    expect(expandLSystem('A', rules, 3, 1)).toBe('ABAAB');
  });

  it('is deterministic with the same seed', () => {
    const rules = [
      { symbol: 'A', replacement: 'F[+A][-A]', probability: 0.7 },
      { symbol: 'A', replacement: 'FA', probability: 0.3 },
    ];
    const a = expandLSystem('A', rules, 3, 42);
    const b = expandLSystem('A', rules, 3, 42);
    expect(a).toBe(b);
  });

  it('produces different results with different seeds (stochastic)', () => {
    const rules = [
      { symbol: 'A', replacement: 'F[+A][-A]', probability: 0.5 },
      { symbol: 'A', replacement: 'FA', probability: 0.5 },
    ];
    const a = expandLSystem('A', rules, 4, 1);
    const b = expandLSystem('A', rules, 4, 999);
    // With different seeds and stochastic rules, results should differ
    // (extremely unlikely to be the same for 4 iterations)
    expect(a).not.toBe(b);
  });

  it('handles stochastic rules with multiple options', () => {
    const rules = [
      { symbol: 'A', replacement: 'X', probability: 1 },
      { symbol: 'A', replacement: 'Y', probability: 1 },
      { symbol: 'A', replacement: 'Z', probability: 1 },
    ];
    // Run many iterations of single step to verify all options appear
    const results = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      results.add(expandLSystem('A', rules, 1, seed));
    }
    // With 100 different seeds, all 3 options should appear
    expect(results.size).toBe(3);
  });

  it('handles typical tree axiom', () => {
    const rules = [
      { symbol: 'A', replacement: 'F[+FA][-FA]' },
    ];
    const result = expandLSystem('FFA', rules, 1, 1);
    expect(result).toBe('FFF[+FA][-FA]');
  });
});

describe('resolveSpeciesRules', () => {
  it('returns config axiom/rules for decurrent mode', () => {
    const config = { ...DEFAULT_TREE_SPECIES_CONFIG, branchMode: 'decurrent' as const };
    const resolved = resolveSpeciesRules(config);
    expect(resolved.axiom).toBe(config.axiom);
    expect(resolved.rules).toBe(config.rules);
  });

  it('returns excurrent rules for excurrent mode', () => {
    const config = { ...DEFAULT_TREE_SPECIES_CONFIG, branchMode: 'excurrent' as const };
    const resolved = resolveSpeciesRules(config);
    expect(resolved.axiom).toBe('FFA');
    // Should have only A rule (branches are pre-expanded inline using G symbol)
    expect(resolved.rules.length).toBe(1);
    const aRule = resolved.rules[0]!;
    expect(aRule.symbol).toBe('A');
    // A rule should end with A (central leader persists)
    expect(aRule.replacement.endsWith('A')).toBe(true);
    // A rule should contain G (short branch step) and L (leaves)
    expect(aRule.replacement).toContain('G');
    expect(aRule.replacement).toContain('L');
  });

  it('excurrent mode produces a tree with central trunk and G steps', () => {
    const config = { ...DEFAULT_TREE_SPECIES_CONFIG, branchMode: 'excurrent' as const, iterations: 3 };
    const resolved = resolveSpeciesRules(config);
    const output = expandLSystem(resolved.axiom, resolved.rules, config.iterations, config.seed);
    expect(output).toContain('F');
    expect(output).toContain('G');
    expect(output).toContain('[');
    expect(output).toContain('L');
  });

  it('excurrent branch complexity scales with excurrentBranchIterations', () => {
    const configShort = { ...DEFAULT_TREE_SPECIES_CONFIG, branchMode: 'excurrent' as const, iterations: 2, excurrentBranchIterations: 0 };
    const configDeep = { ...DEFAULT_TREE_SPECIES_CONFIG, branchMode: 'excurrent' as const, iterations: 2, excurrentBranchIterations: 3 };
    const resolvedShort = resolveSpeciesRules(configShort);
    const resolvedDeep = resolveSpeciesRules(configDeep);
    // Deeper branch iterations produce longer A rules (more pre-expanded branch body)
    const shortLen = resolvedShort.rules[0]!.replacement.length;
    const deepLen = resolvedDeep.rules[0]!.replacement.length;
    expect(deepLen).toBeGreaterThan(shortLen);
  });
});
