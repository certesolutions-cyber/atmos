import React from 'react';

interface StringFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const inputStyle: React.CSSProperties = {
  background: '#2a2a2a',
  color: '#999',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 4px',
  fontSize: '11px',
  width: '140px',
};

export function StringField({ label, value, onChange }: StringFieldProps) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: '12px', color: '#aaa' }}>{label}</span>
      <input
        style={{ ...inputStyle, color: onChange ? '#ccc' : '#999' }}
        value={value}
        readOnly={!onChange}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}
