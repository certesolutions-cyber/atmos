import { describe, it, expect } from 'vitest';
import { createTranslateGizmo, createRotateGizmo, createScaleGizmo } from '../gizmo-meshes.js';

describe('Gizmo Meshes', () => {
  describe('createTranslateGizmo', () => {
    it('creates valid geometry', () => {
      const geo = createTranslateGizmo();
      expect(geo.vertices.length).toBeGreaterThan(0);
      expect(geo.indices.length).toBeGreaterThan(0);
      // Vertices should be multiple of 6 (position + color)
      expect(geo.vertices.length % 6).toBe(0);
      // Indices should be multiple of 3 (triangles)
      expect(geo.indices.length % 3).toBe(0);
    });

    it('has indices within vertex range', () => {
      const geo = createTranslateGizmo();
      const vertCount = geo.vertices.length / 6;
      for (let i = 0; i < geo.indices.length; i++) {
        expect(geo.indices[i]).toBeLessThan(vertCount);
      }
    });
  });

  describe('createRotateGizmo', () => {
    it('creates valid geometry', () => {
      const geo = createRotateGizmo();
      expect(geo.vertices.length).toBeGreaterThan(0);
      expect(geo.indices.length).toBeGreaterThan(0);
      expect(geo.vertices.length % 6).toBe(0);
      expect(geo.indices.length % 3).toBe(0);
    });
  });

  describe('createScaleGizmo', () => {
    it('creates valid geometry', () => {
      const geo = createScaleGizmo();
      expect(geo.vertices.length).toBeGreaterThan(0);
      expect(geo.indices.length).toBeGreaterThan(0);
      expect(geo.vertices.length % 6).toBe(0);
      expect(geo.indices.length % 3).toBe(0);
    });
  });
});
