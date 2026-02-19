import React from 'react';

interface BooleanFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
};

export function BooleanField({ label, value, onChange }: BooleanFieldProps) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '12px', color: '#aaa' }}>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
