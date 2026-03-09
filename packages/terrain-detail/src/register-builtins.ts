/**
 * Register detail system components with the component registry.
 */

import { registerComponent } from '@certe/atmos-core';
import type { PropertyDef } from '@certe/atmos-core';
import { DetailSystem } from './detail-system.js';
import type { DetailTypeConfig } from './types.js';

const MAX_INSPECTOR_TYPES = 8;

const TYPE_FIELDS: Array<{
  key: string; type: 'number' | 'string'; label: string;
  min?: number; max?: number; step?: number;
}> = [
  { key: 'width', type: 'number', label: 'Width', min: 0.05, max: 5, step: 0.05 },
  { key: 'height', type: 'number', label: 'Height', min: 0.05, max: 5, step: 0.05 },
  { key: 'fadeStart', type: 'number', label: 'Fade Start', min: 5, max: 200, step: 5 },
  { key: 'fadeEnd', type: 'number', label: 'Fade End', min: 10, max: 300, step: 5 },
  { key: 'colorVariation', type: 'number', label: 'Color Variation', min: 0, max: 1, step: 0.05 },
];

export function registerDetailBuiltins(): void {
  const properties: PropertyDef[] = [
    { key: 'windStrength', type: 'number', min: 0, max: 2, step: 0.05 },
    {
      key: '_typeCount',
      type: 'number',
      label: 'Type Count',
      serialize: false,
      min: 0, max: MAX_INSPECTOR_TYPES, step: 1,
      getter: (c) => (c as DetailSystem).typeCount,
      setter: (c, v) => {
        const ds = c as DetailSystem;
        const target = v as number;
        if (!ds.isInitialized && ds.hasPendingConfigs) return;
        while (ds.typeCount < target) ds.addDefaultType();
        while (ds.typeCount > target) ds.removeLastType();
      },
    },
    {
      key: '_clearInstances',
      type: 'button',
      buttonLabel: 'Clear All Details',
      serialize: false,
      setter: (c) => (c as DetailSystem).clearAllInstances(),
    },
    // Hidden serialization properties
    {
      key: '_typeConfigs',
      type: 'string',
      visibleWhen: () => false,
      getter: (c) => (c as DetailSystem).getTypeConfigs(),
      setter: (c, v) => (c as DetailSystem).setTypeConfigs(v as DetailTypeConfig[]),
    },
    {
      key: '_instancesData',
      type: 'string',
      visibleWhen: () => false,
      getter: (c) => (c as DetailSystem).getInstancesData(),
      setter: (c, v) => (c as DetailSystem).setInstancesData(v as import('./types.js').DetailInstance[][]),
    },
  ];

  // Per-type config + texture properties
  for (let i = 0; i < MAX_INSPECTOR_TYPES; i++) {
    const idx = i;

    for (const field of TYPE_FIELDS) {
      properties.push({
        key: `_dt${idx}_${field.key}`,
        type: field.type as 'number',
        label: field.label,
        serialize: false,
        min: field.min,
        max: field.max,
        step: field.step,
        group: `detail_${idx}`,
        visibleWhen: (c) => (c as DetailSystem).typeCount > idx,
        getter: (c) => {
          const cfg = (c as DetailSystem).getTypeConfig(idx);
          return cfg ? (cfg as unknown as Record<string, unknown>)[field.key] : 0;
        },
        setter: (c, v) => {
          (c as DetailSystem).updateTypeConfig(idx, field.key as keyof DetailTypeConfig, v);
        },
      });
    }

    // Texture property
    properties.push({
      key: `_detailTex${idx}`,
      type: 'texture',
      label: 'Texture',
      group: `detail_${idx}`,
      visibleWhen: (c) => (c as DetailSystem).typeCount > idx,
      getter: (c) => (c as DetailSystem).getTextureSource(idx),
      setter: (c, v) => (c as DetailSystem).setTextureSource(idx, v as string),
    });
  }

  registerComponent(DetailSystem, {
    name: 'DetailSystem',
    properties,
  });
}
