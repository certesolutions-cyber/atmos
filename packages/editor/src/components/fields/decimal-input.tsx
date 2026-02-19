import React, { useState, useRef } from 'react';

interface DecimalInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  style?: React.CSSProperties;
}

function formatValue(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '0';
  const rounded = parseFloat(v.toFixed(decimals));
  return String(rounded);
}

function clamp(v: number, min?: number, max?: number): number {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}

export function DecimalInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  decimals = 4,
  style,
}: DecimalInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const display = editing ? text : formatValue(value, decimals);

  const parse = (raw: string): number => {
    if (raw.trim() === '' || raw === '-') return clamp(0, min, max);
    let num = parseFloat(raw);
    if (!Number.isFinite(num)) return clamp(0, min, max);
    num = parseFloat(num.toFixed(decimals));
    return clamp(num, min, max);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? step : -step;
      const current = parseFloat(text) || 0;
      const next = parseFloat((current + delta).toFixed(decimals));
      const clamped = clamp(next, min, max);
      setText(String(clamped));
      onChange(clamped);
    } else if (e.key === 'Escape') {
      setEditing(false);
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      style={style}
      value={display}
      onFocus={() => {
        setEditing(true);
        setText(formatValue(valueRef.current, decimals));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={handleKeyDown}
    />
  );
}
