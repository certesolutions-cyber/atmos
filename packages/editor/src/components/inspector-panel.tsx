import React, { useState, useEffect } from 'react';
import type { Component, PropertyDef, EnumPropertyDef, NumberPropertyDef, Scene, GameObject } from '@certe/atmos-core';
import { getComponentDef, getAllRegisteredComponents, Transform } from '@certe/atmos-core';
import type { EditorState } from '../editor-state.js';
import type { MaterialManager } from '../material-manager.js';
import { getProperty, setProperty } from '../property-setters.js';
import { isPrefabLocked, getPrefabRoot } from '../scene-operations.js';
import { NumberField } from './fields/number-field.js';
import { Vec3Field } from './fields/vec3-field.js';
import { QuatField } from './fields/quat-field.js';
import { ColorField } from './fields/color-field.js';
import { EnumField } from './fields/enum-field.js';
import { BooleanField } from './fields/boolean-field.js';
import { GameObjectRefField } from './fields/game-object-ref-field.js';
import { StringField } from './fields/string-field.js';
import { MaterialAssetField } from './fields/material-asset-field.js';
import { MaterialInspector } from './material-inspector.js';

interface InspectorPanelProps {
  editorState: EditorState;
  materialManager?: MaterialManager;
  componentFactory?: (ctor: new () => Component, go: import('@certe/atmos-core').GameObject) => void;
  componentFilter?: (ctor: new () => Component, go: import('@certe/atmos-core').GameObject) => string | null;
  componentRemover?: (comp: Component, go: import('@certe/atmos-core').GameObject) => void;
  onDropModel?: (path: string, go: import('@certe/atmos-core').GameObject) => void;
}

const panelStyle: React.CSSProperties = {
  flex: 1,
  background: '#1c1c1c',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.5px',
  textTransform: 'uppercase' as const,
  borderBottom: '1px solid #2a2a2a',
  background: '#1c1c1c',
};

const sectionStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #222',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#6ab0d6',
  marginBottom: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '13px',
  padding: '0 4px',
  lineHeight: 1,
  fontFamily: 'inherit',
};

const addBtnStyle: React.CSSProperties = {
  display: 'block',
  width: 'calc(100% - 20px)',
  margin: '8px 10px',
  padding: '5px',
  background: '#2c2c2c',
  color: '#999',
  border: '1px solid #3a3a3a',
  borderRadius: '4px',
  fontSize: '11px',
  cursor: 'pointer',
  textAlign: 'center' as const,
  fontFamily: 'inherit',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  background: '#252525',
  border: '1px solid #3a3a3a',
  borderRadius: '4px',
  padding: '4px 0',
  maxHeight: '200px',
  overflow: 'auto',
  zIndex: 1000,
  minWidth: '200px',
  boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
};

const dropdownItemStyle: React.CSSProperties = {
  padding: '5px 12px',
  fontSize: '11px',
  cursor: 'pointer',
  color: '#b8b8b8',
};

/** After a material.* property changes on a component, persist it to the .mat.json file. */
function syncMaterialToDisk(
  component: Component | Record<string, unknown>,
  def: PropertyDef,
  value: unknown,
  materialManager?: MaterialManager,
): void {
  if (!materialManager || !def.key.startsWith('material.')) return;
  const comp = component as Record<string, unknown>;
  const matSource = comp['materialSource'] as string | undefined;
  if (!matSource || !matSource.endsWith('.mat.json')) return;
  const assetKey = def.key.slice('material.'.length); // e.g. 'albedo', 'metallic'
  materialManager.updateMaterial(matSource, { [assetKey]: value });
}

function renderField(
  component: Component | { position: unknown; rotation: unknown; scale: unknown },
  def: PropertyDef,
  refresh: () => void,
  scene: Scene,
  selfId: number,
  materialManager?: MaterialManager,
  target?: Component,
) {
  const value = getProperty(component, def);
  const label = def.key.split('.').pop()!;

  switch (def.type) {
    case 'number':
      return (
        <NumberField
          key={def.key}
          label={label}
          value={value as number}
          def={def as NumberPropertyDef}
          onChange={(v) => {
            setProperty(component, def, v);
            syncMaterialToDisk(component, def, v, materialManager);
            refresh();
          }}
        />
      );
    case 'vec3':
      return (
        <Vec3Field
          key={def.key}
          label={label}
          value={(value as number[]) ?? [0, 0, 0]}
          onChange={(v) => {
            setProperty(component, def, v);
            syncMaterialToDisk(component, def, v, materialManager);
            refresh();
          }}
        />
      );
    case 'quat':
      return (
        <QuatField
          key={def.key}
          label={label}
          value={(value as number[]) ?? [0, 0, 0, 1]}
          onChange={(v) => {
            setProperty(component, def, v);
            refresh();
          }}
        />
      );
    case 'color':
      return (
        <ColorField
          key={def.key}
          label={label}
          value={(value as number[]) ?? [1, 1, 1, 1]}
          onChange={(v) => {
            setProperty(component, def, v);
            syncMaterialToDisk(component, def, v, materialManager);
            refresh();
          }}
        />
      );
    case 'enum':
      return (
        <EnumField
          key={def.key}
          label={label}
          value={(value as string) ?? ''}
          def={def as EnumPropertyDef}
          target={target}
          onChange={(v) => {
            setProperty(component, def, v);
            refresh();
          }}
        />
      );
    case 'boolean':
      return (
        <BooleanField
          key={def.key}
          label={label}
          value={(value as boolean) ?? false}
          onChange={(v) => {
            setProperty(component, def, v);
            refresh();
          }}
        />
      );
    case 'string':
      return (
        <StringField
          key={def.key}
          label={label}
          value={(value as string) ?? ''}
        />
      );
    case 'gameObjectRef':
      return (
        <GameObjectRefField
          key={def.key}
          label={label}
          value={(value as GameObject | null) ?? null}
          scene={scene}
          selfId={selfId}
          onChange={(v) => {
            setProperty(component, def, v);
            refresh();
          }}
        />
      );
    case 'materialAsset':
      if (!materialManager) return null;
      return (
        <MaterialAssetField
          key={def.key}
          label={label}
          value={(value as string) ?? ''}
          materialManager={materialManager}
          onChange={(path) => {
            setProperty(component, def, path);
            const target = component as Record<string, unknown>;
            materialManager.getMaterial(path).then((mat) => {
              target['material'] = mat;
              target['materialBindGroup'] = null; // force rebind
              refresh();
            });
          }}
        />
      );
    default:
      return null;
  }
}

export function InspectorPanel({ editorState, materialManager, componentFactory, componentFilter, componentRemover, onDropModel }: InspectorPanelProps) {
  const [, setTick] = useState(0);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const unsub1 = editorState.on('selectionChanged', refresh);
    const unsub2 = editorState.on('inspectorChanged', refresh);
    const unsub3 = editorState.on('scriptsChanged', refresh);
    const unsub4 = editorState.on('materialSelected', refresh);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [editorState]);

  const refresh = () => setTick((t) => t + 1);
  const selected = editorState.selected;
  const matPath = editorState.selectedMaterialPath;

  // Show material inspector when a .mat.json file is selected in asset browser
  if (matPath && materialManager) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Inspector</div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <MaterialInspector
            editorState={editorState}
            materialManager={materialManager}
            path={matPath}
          />
        </div>
      </div>
    );
  }

  const selectionSize = editorState.selection.size;

  if (selectionSize > 1) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Inspector</div>
        <div style={{ padding: '16px', color: '#888', fontSize: '11px' }}>{selectionSize} objects selected</div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Inspector</div>
        <div style={{ padding: '16px', color: '#555', fontSize: '11px' }}>No object selected</div>
      </div>
    );
  }

  // Collect components with defs
  type InspectableEntry = {
    name: string;
    target: Component | { position: unknown; rotation: unknown; scale: unknown };
    properties: PropertyDef[];
    component?: Component;
    isTransform: boolean;
  };

  const entries: InspectableEntry[] = [];

  // Transform (always present, not a Component)
  const transformDef = getComponentDef(Transform);
  if (transformDef) {
    entries.push({
      name: transformDef.name,
      target: selected.transform,
      properties: transformDef.properties,
      isTransform: true,
    });
  }

  for (const comp of selected.getComponents()) {
    const def = getComponentDef(comp.constructor as typeof Component);
    if (def) {
      entries.push({
        name: def.name,
        target: comp,
        properties: def.properties,
        component: comp,
        isTransform: false,
      });
    }
  }

  // Compute available components for "Add Component"
  const existingCtors = new Set(
    selected.getComponents().map((c) => c.constructor),
  );
  existingCtors.add(Transform);

  const allRegistered = getAllRegisteredComponents();
  const addableComponents: Array<{ ctor: new () => Component; name: string; disabledReason: string | null }> = [];
  for (const [ctor, def] of allRegistered) {
    if (def.allowMultiple || !existingCtors.has(ctor)) {
      const reason = componentFilter ? componentFilter(ctor as new () => Component, selected) : null;
      addableComponents.push({ ctor: ctor as new () => Component, name: def.name, disabledReason: reason });
    }
  }
  // Merge discovered script assets (not yet in registry or already on object)
  for (const script of editorState.scriptAssets) {
    if (!existingCtors.has(script.ctor) && !addableComponents.some((c) => c.ctor === script.ctor)) {
      addableComponents.push({ ctor: script.ctor, name: `${script.name} (Script)`, disabledReason: null });
    }
  }

  const handleAddComponent = (ctor: new () => Component) => {
    if (componentFactory) {
      componentFactory(ctor, selected);
    } else {
      selected.addComponent(ctor);
    }
    setShowAddDropdown(false);
    refresh();
  };

  const handleRemoveComponent = (comp: Component) => {
    if (componentRemover) {
      componentRemover(comp, selected);
    } else {
      selected.removeComponent(comp);
    }
    refresh();
  };

  const handleToggleEnabled = (comp: Component) => {
    comp.enabled = !comp.enabled;
    refresh();
  };

  const locked = isPrefabLocked(selected);
  const prefabRoot = getPrefabRoot(selected);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        Inspector
        <span style={{ color: '#b8b8b8', marginLeft: '6px', fontWeight: 400, textTransform: 'none' as const }}>
          {selected.name}
        </span>
      </div>
      {prefabRoot && (
        <div style={{ padding: '4px 10px', fontSize: '10px', color: '#b888e8', background: '#2a1a3a', borderBottom: '1px solid #3a2a4a' }}>
          Prefab: {prefabRoot.prefabSource} (locked)
        </div>
      )}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          ...(dragOver ? { outline: '1px dashed #3388cc', outlineOffset: '-1px', background: '#1a2a3a' } : undefined),
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-atmos-script')
            && !e.dataTransfer.types.includes('application/x-atmos-model')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const modelPath = e.dataTransfer.getData('application/x-atmos-model');
          if (modelPath && selected && onDropModel) {
            onDropModel(modelPath, selected);
            return;
          }
          const scriptPath = e.dataTransfer.getData('application/x-atmos-script');
          if (!scriptPath || !selected) return;
          const script = editorState.scriptAssets.find((s) => s.path === scriptPath);
          if (!script) return;
          if (selected.getComponents().some((c) => c.constructor === script.ctor)) return;
          handleAddComponent(script.ctor);
        }}
      >
        {entries.map((entry) => (
          <div key={entry.name} style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {!entry.isTransform && entry.component && (
                  <input
                    type="checkbox"
                    checked={entry.component.enabled}
                    onChange={() => handleToggleEnabled(entry.component!)}
                    style={{ margin: 0 }}
                  />
                )}
                {entry.name}
              </span>
              {!entry.isTransform && entry.component && !locked && (
                <button
                  style={removeBtnStyle}
                  title="Remove Component"
                  onClick={() => handleRemoveComponent(entry.component!)}
                >
                  x
                </button>
              )}
            </div>
            {entry.properties
              .filter((prop) => !prop.visibleWhen || prop.visibleWhen(entry.target))
              .map((prop) => renderField(entry.target, prop, refresh, editorState.scene, selected.id, materialManager, entry.component))}
          </div>
        ))}

        {!locked && <div style={{ position: 'relative' }}>
          <button
            style={addBtnStyle}
            onClick={() => setShowAddDropdown(!showAddDropdown)}
          >
            Add Component
          </button>
          {showAddDropdown && addableComponents.length > 0 && (
            <div style={dropdownStyle}>
              {addableComponents.map(({ ctor, name, disabledReason }) => (
                <div
                  key={name}
                  style={disabledReason
                    ? { ...dropdownItemStyle, color: '#555', cursor: 'default' }
                    : dropdownItemStyle}
                  title={disabledReason ?? undefined}
                  onMouseEnter={(e) => {
                    if (!disabledReason) (e.currentTarget as HTMLElement).style.background = '#3a5a8a';
                  }}
                  onMouseLeave={(e) => {
                    if (!disabledReason) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                  onClick={() => { if (!disabledReason) handleAddComponent(ctor); }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
          {showAddDropdown && addableComponents.length === 0 && (
            <div style={dropdownStyle}>
              <div style={{ ...dropdownItemStyle, color: '#666' }}>
                No components available
              </div>
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}
