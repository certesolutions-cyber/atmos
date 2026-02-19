import React, { useState, useEffect, useCallback } from 'react';
import type { ShaderType, MaterialAssetData } from '@atmos/renderer';
import type { MaterialManager } from '../material-manager.js';
import type { EditorState } from '../editor-state.js';

interface MaterialInspectorProps {
  editorState: EditorState;
  materialManager: MaterialManager;
  path: string;
}

const sectionStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #222',
};

const titleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#6ab0d6',
  marginBottom: '6px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
  gap: '6px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#aaa',
  flexShrink: 0,
  minWidth: '60px',
};

const inputStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 6px',
  fontSize: '11px',
  fontFamily: 'inherit',
  outline: 'none',
  flex: 1,
  minWidth: 0,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '2px 4px',
};

const colorSwatchStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  borderRadius: '3px',
  border: '1px solid #555',
  cursor: 'pointer',
  flexShrink: 0,
};

export function MaterialInspector({ editorState, materialManager, path }: MaterialInspectorProps) {
  const [data, setData] = useState<MaterialAssetData | null>(null);
  const [, setTick] = useState(0);

  // Load material data (ensure it's in cache)
  useEffect(() => {
    const cached = materialManager.getAssetData(path);
    if (cached) {
      setData({ ...cached });
    } else {
      materialManager.getMaterial(path).then(() => {
        const d = materialManager.getAssetData(path);
        if (d) setData({ ...d });
      }).catch(() => {});
    }
  }, [materialManager, path]);

  const save = useCallback(async (changes: Partial<MaterialAssetData>) => {
    await materialManager.updateMaterial(path, changes);
    const updated = materialManager.getAssetData(path);
    if (updated) setData({ ...updated });
    setTick((t) => t + 1);
    editorState.notifyInspectorChanged();
  }, [materialManager, path, editorState]);

  if (!data) {
    return <div style={{ padding: '12px', color: '#555', fontSize: '11px' }}>Loading material...</div>;
  }

  const isPbr = data.shader === 'pbr';

  return (
    <>
      <div style={sectionStyle}>
        <div style={titleStyle}>Material</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Name</span>
          <span style={{ ...inputStyle, background: 'none', border: 'none', color: '#c8c8c8' }}>
            {data.name}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>File</span>
          <span style={{ fontSize: '10px', color: '#666', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {path}
          </span>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>Shader</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Type</span>
          <select
            style={selectStyle}
            value={data.shader}
            onChange={(e) => save({ shader: e.target.value as ShaderType })}
          >
            <option value="pbr">PBR</option>
            <option value="unlit">Unlit</option>
          </select>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>Properties</div>
        <AlbedoRow albedo={data.albedo} onSave={save} />
        <TextureRow
          texturePath={data.albedoTexture}
          materialManager={materialManager}
          onSave={save}
        />
        {isPbr && (
          <>
            <SliderRow label="Metallic" value={data.metallic} min={0} max={1} step={0.01}
              onChange={(v) => save({ metallic: v })} />
            <SliderRow label="Roughness" value={data.roughness} min={0} max={1} step={0.01}
              onChange={(v) => save({ roughness: v })} />
          </>
        )}
      </div>
    </>
  );
}

/* ── Albedo color row with color picker ── */

function AlbedoRow({ albedo, onSave }: {
  albedo: [number, number, number, number];
  onSave: (changes: Partial<MaterialAssetData>) => void;
}) {
  const toHex = (r: number, g: number, b: number): string => {
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
  };

  const fromHex = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  };

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>Albedo</span>
      <input
        type="color"
        value={toHex(albedo[0], albedo[1], albedo[2])}
        onChange={(e) => {
          const [r, g, b] = fromHex(e.target.value);
          onSave({ albedo: [r, g, b, albedo[3]] });
        }}
        style={{ ...colorSwatchStyle, padding: 0, background: 'none' }}
      />
      <span style={{ fontSize: '10px', color: '#888' }}>
        {albedo.slice(0, 3).map((v) => v.toFixed(2)).join(', ')}
      </span>
    </div>
  );
}

/* ── Texture field row ── */

function TextureRow({ texturePath, materialManager, onSave }: {
  texturePath: string | undefined;
  materialManager: MaterialManager;
  onSave: (changes: Partial<MaterialAssetData>) => void;
}) {
  const [textures, setTextures] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    materialManager.listTextures().then(setTextures).catch(() => {});
  }, [materialManager, texturePath]);

  return (
    <div
      style={{
        ...rowStyle,
        ...(dragOver ? { outline: '1px dashed #3388cc', outlineOffset: '-1px', borderRadius: '3px' } : undefined),
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-atmos-texture')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const path = e.dataTransfer.getData('application/x-atmos-texture');
        if (path) {
          e.preventDefault();
          onSave({ albedoTexture: path });
        }
      }}
    >
      <span style={labelStyle}>Texture</span>
      <select
        style={selectStyle}
        value={texturePath ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onSave({ albedoTexture: val || undefined });
        }}
      >
        <option value="">None</option>
        {textures.map((t) => (
          <option key={t} value={t}>{t.split('/').pop()}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Slider row ── */

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span style={{ fontSize: '10px', color: '#888', width: '32px', textAlign: 'right' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
