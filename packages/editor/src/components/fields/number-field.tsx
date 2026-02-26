import React from 'react';
import type { NumberPropertyDef } from '@certe/atmos-core';
import { DecimalInput } from './decimal-input.js';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  def: NumberPropertyDef;
}

const inputStyle: React.CSSProperties = {
  width: '60px',
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

export function NumberField({ label, value, onChange, def }: NumberFieldProps) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '12px', color: '#aaa' }}>{label}</span>
      <DecimalInput
        value={Number.isFinite(value) ? value : 0}
        min={def.min}
        max={def.max}
        step={def.step ?? 0.1}
        style={inputStyle}
        onChange={onChange}
      />
    </div>
  );
}
