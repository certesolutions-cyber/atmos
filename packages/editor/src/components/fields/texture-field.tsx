import React, { useState, useEffect } from 'react';
import type { MaterialManager } from '../../material-manager.js';

interface TextureFieldProps {
  label: string;
  value: string;
  materialManager: MaterialManager;
  onChange: (value: string) => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const selectStyle: React.CSSProperties = {
  background: '#2a2a2a',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 4px',
  fontSize: '11px',
  width: '140px',
};

export function TextureField({ label, value, materialManager, onChange }: TextureFieldProps) {
  const [textures, setTextures] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    materialManager.listAllTextures().then(setTextures).catch(() => {});
  }, [materialManager, value]);

  // Ensure current value is always in the options list (e.g. after drag-drop)
  const options = textures.includes(value) || !value ? textures : [value, ...textures];

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
          onChange(path);
        }
      }}
    >
      <span style={{ fontSize: '12px', color: '#aaa' }}>{label}</span>
      <select
        style={selectStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">None</option>
        {options.map((t) => (
          <option key={t} value={t}>{t.split('/').pop()}</option>
        ))}
      </select>
    </div>
  );
}
