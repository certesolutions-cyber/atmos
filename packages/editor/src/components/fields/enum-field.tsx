import React from 'react';
import type { EnumPropertyDef } from '@atmos/core';

interface EnumFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  def: EnumPropertyDef;
}

const selectStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 4px',
  fontSize: '12px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
};

export function EnumField({ label, value, onChange, def }: EnumFieldProps) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '12px', color: '#aaa' }}>{label}</span>
      <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {def.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
