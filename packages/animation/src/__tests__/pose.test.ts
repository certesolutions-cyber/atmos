import { describe, it, expect } from 'vitest';
import { computeBoneMatrices } from '../pose.js';
import { createSkeleton } from '../skeleton.js';
import { Mat4 } from '@certe/atmos-math';

describe('computeBoneMatrices', () => {
  it('produces identity for a single joint at rest pose with identity IBM', () => {
    const ibm = new Float32Array(16);
    Mat4.identity(ibm);

    const skeleton = createSkeleton(
      [{ name: 'root', parentIndex: -1 }],
      ibm,
    );

    const out = new Float32Array(16);
    const localT = new Float32Array([0, 0, 0]);
    const localR = new Float32Array([0, 0, 0, 1]); // identity quat
    const localS = new Float32Array([1, 1, 1]);

    computeBoneMatrices(out, skeleton, localT, localR, localS);

    // Should be identity
    for (let i = 0; i < 16; i++) {
      const expected = (i % 5 === 0) ? 1 : 0;
      expect(out[i]).toBeCloseTo(expected, 5);
    }
  });

  it('applies translation to a single root joint', () => {
    const ibm = new Float32Array(16);
    Mat4.identity(ibm);

    const skeleton = createSkeleton(
      [{ name: 'root', parentIndex: -1 }],
      ibm,
    );

    const out = new Float32Array(16);
    const localT = new Float32Array([5, 10, 15]);
    const localR = new Float32Array([0, 0, 0, 1]);
    const localS = new Float32Array([1, 1, 1]);

    computeBoneMatrices(out, skeleton, localT, localR, localS);

    // Translation should appear in columns 12-14
    expect(out[12]).toBeCloseTo(5);
    expect(out[13]).toBeCloseTo(10);
    expect(out[14]).toBeCloseTo(15);
  });

  it('chains parent-child transforms', () => {
    // Two joints: root translates +5 on X, child translates +3 on X
    // With identity IBM, child's world position should be 5+3=8
    const ibm = new Float32Array(32);
    Mat4.identity(ibm.subarray(0, 16));
    Mat4.identity(ibm.subarray(16, 32));

    const skeleton = createSkeleton(
      [
        { name: 'root', parentIndex: -1 },
        { name: 'child', parentIndex: 0 },
      ],
      ibm,
    );

    const out = new Float32Array(32);
    const localT = new Float32Array([5, 0, 0, 3, 0, 0]);
    const localR = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
    const localS = new Float32Array([1, 1, 1, 1, 1, 1]);

    computeBoneMatrices(out, skeleton, localT, localR, localS);

    // Root: translate (5, 0, 0)
    expect(out[12]).toBeCloseTo(5);

    // Child: translate (5+3, 0, 0) = (8, 0, 0)
    expect(out[16 + 12]).toBeCloseTo(8);
  });

  it('applies inverse bind matrix', () => {
    // IBM offsets the bind pose. If bind pose had joint at (10, 0, 0),
    // IBM translates by (-10, 0, 0). At rest pose (10, 0, 0), result should be identity.
    const ibm = new Float32Array(16);
    Mat4.identity(ibm);
    ibm[12] = -10; // translate by -10 on X

    const skeleton = createSkeleton(
      [{ name: 'root', parentIndex: -1 }],
      ibm,
    );

    const out = new Float32Array(16);
    const localT = new Float32Array([10, 0, 0]); // bind pose position
    const localR = new Float32Array([0, 0, 0, 1]);
    const localS = new Float32Array([1, 1, 1]);

    computeBoneMatrices(out, skeleton, localT, localR, localS);

    // world (translate 10) * IBM (translate -10) = identity
    expect(out[12]).toBeCloseTo(0);
    expect(out[13]).toBeCloseTo(0);
    expect(out[14]).toBeCloseTo(0);
  });

  it('three-joint chain computes correctly', () => {
    const ibm = new Float32Array(48);
    Mat4.identity(ibm.subarray(0, 16));
    Mat4.identity(ibm.subarray(16, 32));
    Mat4.identity(ibm.subarray(32, 48));

    const skeleton = createSkeleton(
      [
        { name: 'hip', parentIndex: -1 },
        { name: 'knee', parentIndex: 0 },
        { name: 'foot', parentIndex: 1 },
      ],
      ibm,
    );

    const out = new Float32Array(48);
    const localT = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]); // each +1 on Y
    const localR = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const localS = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);

    computeBoneMatrices(out, skeleton, localT, localR, localS);

    // hip at Y=1, knee at Y=2, foot at Y=3
    expect(out[13]).toBeCloseTo(1);
    expect(out[16 + 13]).toBeCloseTo(2);
    expect(out[32 + 13]).toBeCloseTo(3);
  });
});
