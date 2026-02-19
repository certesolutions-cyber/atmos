import React from 'react';
import { DecimalInput } from './decimal-input.js';

interface Vec3FieldProps {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
}

const inputStyle: React.CSSProperties = {
  width: '50px',
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
  gap: '4px',
};

const LABELS = ['X', 'Y', 'Z'];
const COLORS = ['#e06060', '#60c060', '#6080e0'];

export function Vec3Field({ label, value, onChange }: Vec3FieldProps) {
  const v = value.length >= 3 ? value : [0, 0, 0];

  const handleChange = (index: number, num: number) => {
    const next = [...v];
    next[index] = num;
    onChange(next);
  };

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '2px' }}>{label}</div>
      <div style={rowStyle}>
        {LABELS.map((axis, i) => (
          <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '11px', color: COLORS[i], fontWeight: 'bold' }}>{axis}</span>
            <DecimalInput
              value={Number.isFinite(v[i]) ? v[i]! : 0}
              step={0.1}
              style={inputStyle}
              onChange={(num) => handleChange(i, num)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
