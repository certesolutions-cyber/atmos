import React from 'react';
import { DecimalInput } from './decimal-input.js';
import { rgbToHex, hexToRgb } from '../../color-utils.js';

interface ColorFieldProps {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
}

const inputStyle: React.CSSProperties = {
  width: '40px',
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
  gap: '4px',
  padding: '2px 0',
};

const CHANNELS = ['R', 'G', 'B', 'A'];
const COLORS = ['#e06060', '#60c060', '#6080e0', '#aaa'];

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const v = value.length >= 4 ? value
    : [value[0] ?? 1, value[1] ?? 1, value[2] ?? 1, value[3] ?? 1];

  const handleChannel = (index: number, num: number) => {
    const next = [...v];
    next[index] = num;
    onChange(next);
  };

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '2px' }}>{label}</div>
      <div style={rowStyle}>
        <input
          type="color"
          value={rgbToHex(v[0] ?? 1, v[1] ?? 1, v[2] ?? 1)}
          style={{ width: '28px', height: '22px', padding: 0, border: 'none', cursor: 'pointer' }}
          onChange={(e) => {
            const [r, g, b] = hexToRgb(e.target.value);
            onChange([r, g, b, v[3] ?? 1]);
          }}
        />
        {CHANNELS.map((ch, i) => (
          <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            <span style={{ fontSize: '10px', color: COLORS[i] }}>{ch}</span>
            <DecimalInput
              value={v[i] ?? 0}
              min={0}
              max={1}
              step={0.05}
              style={inputStyle}
              onChange={(num) => handleChannel(i, num)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
