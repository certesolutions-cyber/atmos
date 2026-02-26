import React, { useState, useCallback } from 'react';
import type { GameObject, Scene } from '@certe/atmos-core';

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

const dropHighlightStyle: React.CSSProperties = {
  ...rowStyle,
  outline: '1px solid #5bf',
  borderRadius: '3px',
  background: 'rgba(85, 187, 255, 0.1)',
};

export function GameObjectRefField({ label, value, scene, selfId, onChange }: GameObjectRefFieldProps) {
  const [dragOver, setDragOver] = useState(false);

  const objects: GameObject[] = [];
  for (const obj of scene.getAllObjects()) {
    if (obj.id !== selfId) objects.push(obj);
  }
  objects.sort((a, b) => a.name.localeCompare(b.name));

  const selectedId = value ? String(value.id) : '';

  const findObject = useCallback((id: number): GameObject | null => {
    for (const obj of scene.getAllObjects()) {
      if (obj.id === id) return obj;
    }
    return null;
  }, [scene]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only accept hierarchy drags (text/plain with numeric ID)
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const raw = e.dataTransfer.getData('text/plain');
    const id = parseInt(raw, 10);
    if (isNaN(id) || id === selfId) return;
    const obj = findObject(id);
    if (obj) onChange(obj);
  }, [selfId, findObject, onChange]);

  return (
    <div
      style={dragOver ? dropHighlightStyle : rowStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
          const obj = findObject(Number(id));
          onChange(obj);
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
