import React, { useState, useEffect, useCallback } from 'react';
import type { ShaderType, MaterialAssetData } from '@certe/atmos-renderer';
import type { CustomShaderDescriptor } from '@certe/atmos-renderer';
import type { MaterialManager } from '../material-manager.js';
import type { EditorState } from '../editor-state.js';
import { DecimalInput } from './fields/decimal-input.js';
import { rgbToHex, hexToRgb } from '../color-utils.js';

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
  const isCustom = data.shader === 'custom';

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
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      {isCustom && (
        <CustomShaderSection data={data} materialManager={materialManager} onSave={save} />
      )}

      {!isCustom && (
        <>
          <div style={sectionStyle}>
            <div style={titleStyle}>Properties</div>
            <AlbedoRow albedo={data.albedo} onSave={save} />
            <TextureSelectRow label="Albedo Tex" assetKey="albedoTexture"
              texturePath={data.albedoTexture} materialManager={materialManager} onSave={save} />
            {isPbr && (
              <>
                <SliderRow label="Metallic" value={data.metallic} min={0} max={1} step={0.01}
                  onChange={(v) => save({ metallic: v })} />
                <SliderRow label="Roughness" value={data.roughness} min={0} max={1} step={0.01}
                  onChange={(v) => save({ roughness: v })} />
                <TextureSelectRow label="Normal Map" assetKey="normalTexture"
                  texturePath={data.normalTexture} materialManager={materialManager} onSave={save} />
                <TextureSelectRow label="Met/Rough" assetKey="metallicRoughnessTexture"
                  texturePath={data.metallicRoughnessTexture} materialManager={materialManager} onSave={save} />
              </>
            )}
          </div>

          <div style={sectionStyle}>
            <div style={titleStyle}>Emissive</div>
            <ColorRow label="Color" color={data.emissive ?? [0, 0, 0]}
              onChange={(c) => save({ emissive: c })} />
            <SliderRow label="Intensity" value={data.emissiveIntensity ?? 0} min={0} max={20} step={0.1}
              onChange={(v) => save({ emissiveIntensity: v })} />
          </div>

          <div style={sectionStyle}>
            <div style={titleStyle}>Tiling</div>
            <NumberInputRow label="Tile X" value={data.texTilingX ?? 1} step={0.1}
              onChange={(v) => save({ texTilingX: v })} />
            <NumberInputRow label="Tile Y" value={data.texTilingY ?? 1} step={0.1}
              onChange={(v) => save({ texTilingY: v })} />
          </div>
        </>
      )}
    </>
  );
}

/* ── Custom shader section ── */

function CustomShaderSection({ data, materialManager, onSave }: {
  data: MaterialAssetData;
  materialManager: MaterialManager;
  onSave: (changes: Partial<MaterialAssetData>) => void;
}) {
  const [shaders, setShaders] = useState<string[]>([]);
  const [descriptor, setDescriptor] = useState<CustomShaderDescriptor | null>(null);
  const [textures, setTextures] = useState<string[]>([]);

  useEffect(() => {
    materialManager.listShaders().then(setShaders).catch(() => {});
    materialManager.listTextures().then(setTextures).catch(() => {});
  }, [materialManager]);

  useEffect(() => {
    if (data.customShaderPath) {
      materialManager.parseShader(data.customShaderPath).then(setDescriptor).catch(() => setDescriptor(null));
    } else {
      setDescriptor(null);
    }
  }, [materialManager, data.customShaderPath]);

  const uniforms = data.customUniforms ?? {};
  const customTextures = data.customTextures ?? {};

  const setUniform = (name: string, value: number | number[]) => {
    onSave({ customUniforms: { ...uniforms, [name]: value } });
  };

  const setCustomTexture = (name: string, texPath: string) => {
    onSave({ customTextures: { ...customTextures, [name]: texPath || undefined as unknown as string } });
  };

  return (
    <>
      <div style={sectionStyle}>
        <div style={titleStyle}>Custom Shader</div>
        <div style={rowStyle}>
          <span style={labelStyle}>File</span>
          <select
            style={selectStyle}
            value={data.customShaderPath ?? ''}
            onChange={(e) => onSave({ customShaderPath: e.target.value || undefined })}
          >
            <option value="">None</option>
            {shaders.map((s) => (
              <option key={s} value={s}>{s.split('/').pop()}</option>
            ))}
          </select>
        </div>
      </div>

      {descriptor && descriptor.properties.length > 0 && (
        <div style={sectionStyle}>
          <div style={titleStyle}>Properties</div>
          {descriptor.properties.map((prop) => {
            const current = uniforms[prop.name];
            if (prop.type === 'float') {
              const val = typeof current === 'number' ? current : prop.default[0]!;
              return (
                <NumberInputRow key={prop.name} label={prop.name} value={val} step={0.01}
                  onChange={(v) => setUniform(prop.name, v)} />
              );
            }
            if (prop.type === 'vec4') {
              const arr = Array.isArray(current) ? current : prop.default;
              return (
                <ColorRow key={prop.name} label={prop.name}
                  color={[arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0]}
                  onChange={(c) => setUniform(prop.name, [c[0], c[1], c[2], arr[3] ?? 1])} />
              );
            }
            // vec2 and vec3
            const arr = Array.isArray(current) ? current : prop.default;
            return (
              <div key={prop.name}>
                <div style={{ ...rowStyle, paddingBottom: 0 }}>
                  <span style={labelStyle}>{prop.name}</span>
                </div>
                {Array.from({ length: prop.floatCount }, (_, i) => (
                  <NumberInputRow
                    key={`${prop.name}_${i}`}
                    label={['x', 'y', 'z', 'w'][i]!}
                    value={arr[i] ?? 0}
                    step={0.01}
                    onChange={(v) => {
                      const next = [...arr];
                      while (next.length < prop.floatCount) next.push(0);
                      next[i] = v;
                      setUniform(prop.name, next);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {descriptor && descriptor.textures.length > 0 && (
        <div style={sectionStyle}>
          <div style={titleStyle}>Textures</div>
          {descriptor.textures.map((tex) => (
            <div key={tex.name} style={rowStyle}>
              <span style={labelStyle}>{tex.name}</span>
              <select
                style={selectStyle}
                value={customTextures[tex.name] ?? ''}
                onChange={(e) => setCustomTexture(tex.name, e.target.value)}
              >
                <option value="">None</option>
                {textures.map((t) => (
                  <option key={t} value={t}>{t.split('/').pop()}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Albedo color row with color picker ── */

function AlbedoRow({ albedo, onSave }: {
  albedo: [number, number, number, number];
  onSave: (changes: Partial<MaterialAssetData>) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>Albedo</span>
      <input
        type="color"
        value={rgbToHex(albedo[0], albedo[1], albedo[2])}
        onChange={(e) => {
          const [r, g, b] = hexToRgb(e.target.value);
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

/* ── Generic texture select row ── */

function TextureSelectRow({ label, assetKey, texturePath, materialManager, onSave }: {
  label: string;
  assetKey: 'albedoTexture' | 'normalTexture' | 'metallicRoughnessTexture';
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
          onSave({ [assetKey]: path });
        }
      }}
    >
      <span style={labelStyle}>{label}</span>
      <select
        style={selectStyle}
        value={texturePath ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onSave({ [assetKey]: val || undefined });
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

/* ── Color row (generic) ── */

function ColorRow({ label, color, onChange }: {
  label: string;
  color: [number, number, number];
  onChange: (c: [number, number, number]) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="color"
        value={rgbToHex(color[0], color[1], color[2])}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        style={{ ...colorSwatchStyle, padding: 0, background: 'none' }}
      />
      <span style={{ fontSize: '10px', color: '#888' }}>
        {color.map((v) => v.toFixed(2)).join(', ')}
      </span>
    </div>
  );
}

/* ── Number input row (uses shared DecimalInput) ── */

function NumberInputRow({ label, value, step, onChange }: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <DecimalInput value={value} step={step} onChange={onChange} style={inputStyle} />
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
