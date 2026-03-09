import { describe, it, expect } from 'vitest';
import { expandLSystem, mulberry32 } from '../lsystem.js';

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
