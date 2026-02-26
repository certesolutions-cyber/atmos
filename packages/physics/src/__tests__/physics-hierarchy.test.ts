import { describe, it, expect, beforeEach } from 'vitest';
import { GameObject, resetGameObjectIds, Component } from '@certe/atmos-core';
import {
  findAncestorComponent,
  hasAncestorComponent,
  hasDescendantComponent,
} from '../physics-hierarchy.js';

class TagA extends Component {}
class TagB extends Component {}

describe('physics-hierarchy', () => {
  beforeEach(() => {
    resetGameObjectIds();
  });

  describe('findAncestorComponent', () => {
    it('finds component on self', () => {
      const go = new GameObject('Self');
      const tag = go.addComponent(TagA);
      expect(findAncestorComponent(go, TagA)).toBe(tag);
    });

    it('finds component on parent', () => {
      const parent = new GameObject('Parent');
      parent.addComponent(TagA);
      const child = new GameObject('Child');
      child.setParent(parent);
      expect(findAncestorComponent(child, TagA)).toBe(parent.getComponent(TagA));
    });

    it('finds component on grandparent', () => {
      const gp = new GameObject('GP');
      gp.addComponent(TagA);
      const parent = new GameObject('Parent');
      parent.setParent(gp);
      const child = new GameObject('Child');
      child.setParent(parent);
      expect(findAncestorComponent(child, TagA)).toBe(gp.getComponent(TagA));
    });

    it('returns null when not found', () => {
      const go = new GameObject('Alone');
      expect(findAncestorComponent(go, TagA)).toBeNull();
    });

    it('returns nearest ancestor', () => {
      const gp = new GameObject('GP');
      gp.addComponent(TagA);
      const parent = new GameObject('Parent');
      const parentTag = parent.addComponent(TagA);
      parent.setParent(gp);
      const child = new GameObject('Child');
      child.setParent(parent);
      expect(findAncestorComponent(child, TagA)).toBe(parentTag);
    });
  });

  describe('hasAncestorComponent', () => {
    it('excludes self', () => {
      const go = new GameObject('Self');
      go.addComponent(TagA);
      expect(hasAncestorComponent(go, TagA)).toBe(false);
    });

    it('finds on parent', () => {
      const parent = new GameObject('Parent');
      parent.addComponent(TagA);
      const child = new GameObject('Child');
      child.setParent(parent);
      expect(hasAncestorComponent(child, TagA)).toBe(true);
    });

    it('returns false when no ancestor has it', () => {
      const parent = new GameObject('Parent');
      const child = new GameObject('Child');
      child.setParent(parent);
      expect(hasAncestorComponent(child, TagA)).toBe(false);
    });
  });

  describe('hasDescendantComponent', () => {
    it('excludes self', () => {
      const go = new GameObject('Self');
      go.addComponent(TagA);
      expect(hasDescendantComponent(go, TagA)).toBe(false);
    });

    it('finds on direct child', () => {
      const parent = new GameObject('Parent');
      const child = new GameObject('Child');
      child.addComponent(TagA);
      child.setParent(parent);
      expect(hasDescendantComponent(parent, TagA)).toBe(true);
    });

    it('finds on grandchild', () => {
      const gp = new GameObject('GP');
      const parent = new GameObject('Parent');
      parent.setParent(gp);
      const child = new GameObject('Child');
      child.addComponent(TagA);
      child.setParent(parent);
      expect(hasDescendantComponent(gp, TagA)).toBe(true);
    });

    it('returns false when no descendant has it', () => {
      const parent = new GameObject('Parent');
      const child = new GameObject('Child');
      child.setParent(parent);
      expect(hasDescendantComponent(parent, TagA)).toBe(false);
    });
  });
});
