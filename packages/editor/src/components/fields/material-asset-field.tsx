import React, { useState, useEffect } from 'react';
import type { ShaderType } from '@certe/atmos-renderer';
import type { MaterialManager } from '../../material-manager.js';

interface MaterialAssetFieldProps {
  label: string;
  value: string;
  materialManager: MaterialManager;
  onChange: (path: string) => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
  gap: '4px',
};

const selectStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 4px',
  fontSize: '12px',
  flex: 1,
  minWidth: 0,
};

const newBtnStyle: React.CSSProperties = {
  background: '#2c2c2c',
  color: '#999',
  border: '1px solid #3a3a3a',
  borderRadius: '3px',
  padding: '2px 6px',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
};

const dialogOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 3000,
};

const dialogBox: React.CSSProperties = {
  background: '#252525',
  border: '1px solid #3a3a3a',
  borderRadius: '6px',
  padding: '16px',
  minWidth: '240px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
};

const dialogInput: React.CSSProperties = {
  width: '100%',
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '4px 8px',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  marginBottom: '8px',
};

const dialogLabel: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  marginBottom: '4px',
  display: 'block',
};

const dialogBtnRow: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'flex-end',
  marginTop: '12px',
};

export function MaterialAssetField({ label, value, materialManager, onChange }: MaterialAssetFieldProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShader, setNewShader] = useState<ShaderType>('pbr');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    materialManager.listMaterials().then(setOptions).catch(() => {});
  }, [materialManager, value]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const path = await materialManager.createMaterial(newName.trim(), newShader);
    setOptions((prev) => [...prev, path].sort());
    onChange(path);
    setShowCreate(false);
    setNewName('');
    setNewShader('pbr');
  };

  const displayName = (path: string): string => {
    const base = path.split('/').pop() ?? path;
    return base.replace('.mat.json', '');
  };

  return (
    <>
      <div
        style={{
          ...rowStyle,
          ...(dragOver ? { outline: '1px dashed #3388cc', outlineOffset: '-1px', borderRadius: '3px' } : undefined),
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-atmos-material')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          const path = e.dataTransfer.getData('application/x-atmos-material');
          if (path) {
            e.preventDefault();
            onChange(path);
          }
        }}
      >
        <span style={{ fontSize: '12px', color: '#aaa', flexShrink: 0 }}>{label}</span>
        <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
          {!options.includes(value) && value && (
            <option value={value}>{displayName(value)}</option>
          )}
          {options.map((opt) => (
            <option key={opt} value={opt}>{displayName(opt)}</option>
          ))}
        </select>
        <button style={newBtnStyle} onClick={() => setShowCreate(true)} title="New Material">+</button>
      </div>

      {showCreate && (
        <div style={dialogOverlay} onClick={() => setShowCreate(false)}>
          <div style={dialogBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#c8c8c8', marginBottom: '12px' }}>
              New Material
            </div>
            <label style={dialogLabel}>Name</label>
            <input
              style={dialogInput}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
              placeholder="my_material"
            />
            <label style={dialogLabel}>Shader</label>
            <select
              style={{ ...dialogInput, marginBottom: 0 }}
              value={newShader}
              onChange={(e) => setNewShader(e.target.value as ShaderType)}
            >
              <option value="pbr">PBR (Physically Based)</option>
              <option value="unlit">Unlit (Flat Color)</option>
            </select>
            <div style={dialogBtnRow}>
              <button style={newBtnStyle} onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                style={{ ...newBtnStyle, background: '#1a4a7a', color: '#e8e8e8', borderColor: '#3388cc' }}
                onClick={handleCreate}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
