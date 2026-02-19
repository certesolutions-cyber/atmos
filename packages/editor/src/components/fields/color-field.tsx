import React from 'react';
import { DecimalInput } from './decimal-input.js';

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

function toHex(rgba: number[]): string {
  const r = Math.round((rgba[0] ?? 1) * 255);
  const g = Math.round((rgba[1] ?? 1) * 255);
  const b = Math.round((rgba[2] ?? 1) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function fromHex(hex: string, alpha: number): number[] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, alpha];
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const v = value.length >= 4 ? value : [1, 1, 1, 1];

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
          value={toHex(v)}
          style={{ width: '28px', height: '22px', padding: 0, border: 'none', cursor: 'pointer' }}
          onChange={(e) => onChange(fromHex(e.target.value, v[3] ?? 1))}
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
