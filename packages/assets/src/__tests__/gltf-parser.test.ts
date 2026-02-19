import { describe, it, expect } from 'vitest';
import { parseGlb, readAccessor, readBufferView } from '../gltf-parser.js';
import { buildGlb, createTriangleGlb } from './glb-helpers.js';
import type { GltfJson } from '../gltf-parser.js';

describe('parseGlb', () => {
  it('parses GLB header and chunks', () => {
    const glb = createTriangleGlb();
    const doc = parseGlb(glb);

    expect(doc.json.asset.version).toBe('2.0');
    expect(doc.buffers.length).toBe(1);
    expect(doc.json.meshes?.length).toBe(1);
  });

  it('throws on invalid magic', () => {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, 0x12345678, true);
    expect(() => parseGlb(buf)).toThrow('Not a valid GLB');
  });

  it('throws on missing JSON chunk', () => {
    const buf = new ArrayBuffer(20);
    const view = new DataView(buf);
    view.setUint32(0, 0x46546C67, true); // magic
    view.setUint32(4, 2, true); // version
    view.setUint32(8, 20, true); // length
    view.setUint32(12, 0, true); // chunk length
    view.setUint32(16, 0x004E4942, true); // BIN type (not JSON)
    expect(() => parseGlb(buf)).toThrow('missing JSON');
  });
});

describe('readAccessor', () => {
  it('reads VEC3 float accessor (positions)', () => {
    const doc = parseGlb(createTriangleGlb());
    const positions = readAccessor(doc, 0) as Float32Array;

    expect(positions.length).toBe(9); // 3 vertices * 3 components
    expect(positions[0]).toBe(0);
    expect(positions[3]).toBe(1);
    expect(positions[7]).toBe(1);
  });

  it('reads SCALAR uint16 accessor (indices)', () => {
    const doc = parseGlb(createTriangleGlb());
    const indices = readAccessor(doc, 3) as Uint16Array;

    expect(indices.length).toBe(3);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(1);
    expect(indices[2]).toBe(2);
  });

  it('returns zeroed array when bufferView is undefined', () => {
    const json: GltfJson = {
      asset: { version: '2.0' },
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3' }],
    };
    const doc = parseGlb(buildGlb(json));
    const data = readAccessor(doc, 0);
    expect(data.length).toBe(9);
    expect(data.every(v => v === 0)).toBe(true);
  });
});

describe('readBufferView', () => {
  it('reads raw bytes from a buffer view', () => {
    const doc = parseGlb(createTriangleGlb());
    const bytes = readBufferView(doc, 0); // positions bufferView
    expect(bytes.byteLength).toBe(36);
  });
});
