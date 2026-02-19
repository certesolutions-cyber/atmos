import React from 'react';
import type { GameObject, Scene } from '@atmos/core';

interface GameObjectRefFieldProps {
  label: string;
  value: GameObject | null;
  scene: Scene;
  selfId: number;
  onChange: (value: GameObject | null) => void;
}

const selectStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 4px',
  fontSize: '12px',
  maxWidth: '140px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
};

export function GameObjectRefField({ label, value, scene, selfId, onChange }: GameObjectRefFieldProps) {
  const objects: GameObject[] = [];
  for (const obj of scene.getAllObjects()) {
    if (obj.id !== selfId) objects.push(obj);
  }
  objects.sort((a, b) => a.name.localeCompare(b.name));

  const selectedId = value ? String(value.id) : '';

  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '12px', color: '#aaa' }}>{label}</span>
      <select
        style={selectStyle}
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) {
            onChange(null);
            return;
          }
          const numId = Number(id);
          for (const obj of scene.getAllObjects()) {
            if (obj.id === numId) {
              onChange(obj);
              return;
            }
          }
          onChange(null);
        }}
      >
        <option value="">None</option>
        {objects.map((obj) => (
          <option key={obj.id} value={String(obj.id)}>
            {obj.name}
          </option>
        ))}
      </select>
    </div>
  );
}
