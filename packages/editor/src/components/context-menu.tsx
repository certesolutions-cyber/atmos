import React, { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#252525',
  border: '1px solid #3a3a3a',
  borderRadius: '5px',
  padding: '4px 0',
  minWidth: '160px',
  zIndex: 1000,
  boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
};

const itemStyle: React.CSSProperties = {
  padding: '5px 14px',
  fontSize: '11px',
  cursor: 'pointer',
  color: '#b8b8b8',
  userSelect: 'none',
};

const disabledItemStyle: React.CSSProperties = {
  ...itemStyle,
  color: '#555',
  cursor: 'default',
};

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...menuStyle, left: x, top: y }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={item.disabled ? disabledItemStyle : itemStyle}
          onMouseEnter={(e) => {
            if (!item.disabled) (e.currentTarget as HTMLElement).style.background = '#3a5a8a';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          onClick={() => {
            if (!item.disabled) {
              item.action();
              onClose();
            }
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
