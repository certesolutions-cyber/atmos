/**
 * Register tree components with the component registry.
 */

import { registerComponent } from '@certe/atmos-core';
import type { PropertyDef } from '@certe/atmos-core';
import { TreeSystem } from './tree-system.js';

/** Max species slots shown in inspector. */
const MAX_INSPECTOR_SPECIES = 8;

/** Species config keys exposed in inspector, with their property types and ranges. */
const SPECIES_FIELDS: Array<{
  key: string; type: 'number' | 'string'; label: string;
  min?: number; max?: number; step?: number;
}> = [
  { key: 'iterations', type: 'number', label: 'Iterations', min: 1, max: 8, step: 1 },
  { key: 'branchAngle', type: 'number', label: 'Branch Angle', min: 5, max: 60, step: 1 },
  { key: 'angleVariance', type: 'number', label: 'Angle Variance', min: 0, max: 30, step: 1 },
  { key: 'trunkRadius', type: 'number', label: 'Trunk Radius', min: 0.02, max: 10, step: 0.01 },
  { key: 'radiusTaper', type: 'number', label: 'Radius Taper', min: 0.2, max: 0.95, step: 0.01 },
  { key: 'segmentLength', type: 'number', label: 'Segment Length', min: 0.1, max: 50, step: 0.1 },
  { key: 'curvature', type: 'number', label: 'Curvature', min: 0, max: 1.0, step: 0.01 },
  { key: 'leafCount', type: 'number', label: 'Leaf Count', min: 0, max: 30, step: 1 },
  { key: 'leafWidth', type: 'number', label: 'Leaf Width', min: 0.1, max: 20, step: 0.1 },
  { key: 'leafHeight', type: 'number', label: 'Leaf Height', min: 0.1, max: 20, step: 0.1 },
  { key: 'variants', type: 'number', label: 'Variants', min: 1, max: 8, step: 1 },
  { key: 'lodDistance', type: 'number', label: 'LOD Distance', min: 10, max: 500, step: 5 },
  { key: 'drawDistance', type: 'number', label: 'Draw Distance', min: 0, max: 2000, step: 10 },
  { key: 'seed', type: 'number', label: 'Seed', min: 0, max: 99999, step: 1 },
];

export function registerTreeBuiltins(): void {
  const properties: PropertyDef[] = [
    { key: 'windStrength', type: 'number', min: 0, max: 2, step: 0.05 },
    { key: 'castShadow', type: 'boolean' },
    // Species count control — increase to add, decrease to remove
    {
      key: '_speciesCount',
      type: 'number',
      label: 'Species Count',
      serialize: false, // derived from _speciesConfigs
      min: 0, max: MAX_INSPECTOR_SPECIES, step: 1,
      getter: (c) => (c as TreeSystem).speciesCount,
      setter: (c, v) => {
        const ts = c as TreeSystem;
        const target = v as number;
        // Skip during deserialization — _speciesConfigs handles species creation
        if (!ts.isInitialized && ts.hasPendingConfigs) return;
        while (ts.speciesCount < target) ts.addDefaultSpecies();
        while (ts.speciesCount > target) ts.removeLastSpecies();
      },
    },
    // Clear all instances button
    {
      key: '_clearInstances',
      type: 'button',
      buttonLabel: 'Clear All Trees',
      serialize: false,
      setter: (c) => (c as TreeSystem).clearAllInstances(),
    },
    // Hidden properties — serialize/deserialize species configs + tree instances
    {
      key: '_speciesConfigs',
      type: 'string',
      visibleWhen: () => false,
      getter: (c) => (c as TreeSystem).getSpeciesConfigs(),
      setter: (c, v) => (c as TreeSystem).setSpeciesConfigs(v as import('./types.js').TreeSpeciesConfig[]),
    },
    {
      key: '_instancesData',
      type: 'string',
      visibleWhen: () => false,
      getter: (c) => (c as TreeSystem).getInstancesData(),
      setter: (c, v) => (c as TreeSystem).setInstancesData(v as import('./types.js').TreeInstance[][]),
    },
  ];

  // Add per-species config + texture properties (visible only when species exists)
  for (let i = 0; i < MAX_INSPECTOR_SPECIES; i++) {
    const idx = i;

    // Branch mode selector
    properties.push({
      key: `_sp${idx}_branchMode`,
      type: 'enum',
      label: 'Branch Mode',
      options: ['decurrent', 'excurrent'],
      serialize: false,
      group: `species_${idx}`,
      visibleWhen: (c) => (c as TreeSystem).speciesCount > idx,
      getter: (c) => {
        const cfg = (c as TreeSystem).getSpeciesConfig(idx);
        return cfg?.branchMode ?? 'decurrent';
      },
      setter: (c, v) => {
        (c as TreeSystem).updateSpeciesConfig(idx, 'branchMode', v);
      },
    });

    // Excurrent-specific fields (only visible in excurrent mode)
    properties.push(
      {
        key: `_sp${idx}_excurrentBranchIterations`,
        type: 'number',
        label: 'Branch Iterations',
        serialize: false,
        min: 0, max: 5, step: 1,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx && (c as TreeSystem).getSpeciesConfig(idx)?.branchMode === 'excurrent',
        getter: (c) => (c as TreeSystem).getSpeciesConfig(idx)?.excurrentBranchIterations ?? 2,
        setter: (c, v) => (c as TreeSystem).updateSpeciesConfig(idx, 'excurrentBranchIterations', v),
      },
      {
        key: `_sp${idx}_excurrentBranchScale`,
        type: 'number',
        label: 'Branch Scale',
        serialize: false,
        min: 0.1, max: 2.0, step: 0.05,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx && (c as TreeSystem).getSpeciesConfig(idx)?.branchMode === 'excurrent',
        getter: (c) => (c as TreeSystem).getSpeciesConfig(idx)?.excurrentBranchScale ?? 0.5,
        setter: (c, v) => (c as TreeSystem).updateSpeciesConfig(idx, 'excurrentBranchScale', v),
      },
    );

    // Per-species config fields
    for (const field of SPECIES_FIELDS) {
      properties.push({
        key: `_sp${idx}_${field.key}`,
        type: field.type as 'number',
        label: field.label,
        serialize: false, // species config is serialized via _speciesConfigs
        min: field.min,
        max: field.max,
        step: field.step,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx,
        getter: (c) => {
          const cfg = (c as TreeSystem).getSpeciesConfig(idx);
          return cfg ? (cfg as unknown as Record<string, unknown>)[field.key] : 0;
        },
        setter: (c, v) => {
          (c as TreeSystem).updateSpeciesConfig(idx, field.key as keyof import('./types.js').TreeSpeciesConfig, v);
        },
      });
    }

    // Texture properties
    properties.push(
      {
        key: `_barkTex${idx}`,
        type: 'texture',
        label: `Bark Texture`,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx,
        getter: (c) => (c as TreeSystem).getBarkTextureSource(idx),
        setter: (c, v) => (c as TreeSystem).setBarkTextureSource(idx, v as string),
      },
      {
        key: `_barkNormalTex${idx}`,
        type: 'texture',
        label: `Bark Normal`,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx,
        getter: (c) => (c as TreeSystem).getBarkNormalTextureSource(idx),
        setter: (c, v) => (c as TreeSystem).setBarkNormalTextureSource(idx, v as string),
      },
      {
        key: `_leafTex${idx}`,
        type: 'texture',
        label: `Leaf Texture`,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx,
        getter: (c) => (c as TreeSystem).getLeafTextureSource(idx),
        setter: (c, v) => (c as TreeSystem).setLeafTextureSource(idx, v as string),
      },
      {
        key: `_leafNormalTex${idx}`,
        type: 'texture',
        label: `Leaf Normal`,
        group: `species_${idx}`,
        visibleWhen: (c) => (c as TreeSystem).speciesCount > idx,
        getter: (c) => (c as TreeSystem).getLeafNormalTextureSource(idx),
        setter: (c, v) => (c as TreeSystem).setLeafNormalTextureSource(idx, v as string),
      },
    );
  }

  registerComponent(TreeSystem, {
    name: 'TreeSystem',
    properties,
  });
}
