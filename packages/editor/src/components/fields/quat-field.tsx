import React, { useCallback } from 'react';
import { Quat, Vec3 } from '@certe/atmos-math';
import { DecimalInput } from './decimal-input.js';

interface QuatFieldProps {
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
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function QuatField({ label, value, onChange }: QuatFieldProps) {
  const q = new Float32Array(value.length >= 4 ? value : [0, 0, 0, 1]);
  const euler = Vec3.create();
  Quat.toEuler(euler, q);

  const degrees = [
    euler[0]! * RAD_TO_DEG,
    euler[1]! * RAD_TO_DEG,
    euler[2]! * RAD_TO_DEG,
  ];

  const handleChange = useCallback(
    (index: number, deg: number) => {
      const newDegrees = [...degrees];
      newDegrees[index] = deg;
      const out = Quat.create();
      Quat.fromEuler(
        out,
        newDegrees[0]! * DEG_TO_RAD,
        newDegrees[1]! * DEG_TO_RAD,
        newDegrees[2]! * DEG_TO_RAD,
      );
      onChange(Array.from(out));
    },
    [degrees, onChange],
  );

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '2px' }}>{label} (degrees)</div>
      <div style={rowStyle}>
        {LABELS.map((axis, i) => (
          <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '11px', color: COLORS[i], fontWeight: 'bold' }}>{axis}</span>
            <DecimalInput
              value={degrees[i]!}
              step={1}
              style={inputStyle}
              onChange={(deg) => handleChange(i, deg)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
