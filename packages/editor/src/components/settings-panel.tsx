import React, { useState, useEffect } from 'react';
import type { ProjectSettingsManager, PhysicsSettings } from '../project-settings.js';
import { DecimalInput } from './fields/decimal-input.js';

interface SettingsPanelProps {
  settingsManager: ProjectSettingsManager;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
};

const panelStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #3a3a3a',
  borderRadius: '8px',
  width: '420px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: '12px',
  color: '#c8c8c8',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #2a2a2a',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0',
  borderBottom: '1px solid #2a2a2a',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  cursor: 'pointer',
  background: active ? '#2a2a2a' : 'transparent',
  color: active ? '#e8e8e8' : '#888',
  border: 'none',
  borderBottom: active ? '2px solid #4a9eff' : '2px solid transparent',
  fontSize: '11px',
  fontFamily: 'inherit',
});

const bodyStyle: React.CSSProperties = {
  padding: '16px',
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: '10px',
  gap: '8px',
};

const labelStyle: React.CSSProperties = {
  width: '110px',
  flexShrink: 0,
  fontSize: '11px',
  color: '#999',
};

const inputStyle: React.CSSProperties = {
  width: '70px',
  background: '#2a2a2a',
  border: '1px solid #3a3a3a',
  borderRadius: '3px',
  color: '#c8c8c8',
  padding: '3px 6px',
  fontSize: '11px',
  fontFamily: 'inherit',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: '16px',
  cursor: 'pointer',
  padding: '0 4px',
  fontFamily: 'inherit',
};

const hintStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#666',
  marginLeft: '4px',
};

type Tab = 'physics';

function PhysicsTab({ settingsManager }: { settingsManager: ProjectSettingsManager }) {
  const [physics, setPhysics] = useState<PhysicsSettings>({ ...settingsManager.settings.physics });

  useEffect(() => {
    return settingsManager.onChange(() => {
      setPhysics({ ...settingsManager.settings.physics });
    });
  }, [settingsManager]);

  const update = (partial: Partial<PhysicsSettings>) => {
    settingsManager.updatePhysics(partial);
  };

  const grav = physics.gravity;

  return (
    <div>
      <div style={rowStyle}>
        <span style={labelStyle}>Gravity</span>
        <span style={{ fontSize: '10px', color: '#666', width: '10px' }}>X</span>
        <DecimalInput value={grav[0]} onChange={(v) => update({ gravity: [v, grav[1], grav[2]] })} decimals={2} style={inputStyle} />
        <span style={{ fontSize: '10px', color: '#666', width: '10px' }}>Y</span>
        <DecimalInput value={grav[1]} onChange={(v) => update({ gravity: [grav[0], v, grav[2]] })} decimals={2} style={inputStyle} />
        <span style={{ fontSize: '10px', color: '#666', width: '10px' }}>Z</span>
        <DecimalInput value={grav[2]} onChange={(v) => update({ gravity: [grav[0], grav[1], v] })} decimals={2} style={inputStyle} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Fixed Timestep</span>
        <DecimalInput
          value={physics.fixedTimestep}
          onChange={(v) => update({ fixedTimestep: v })}
          min={0.004}
          max={0.033}
          decimals={4}
          step={0.001}
          style={inputStyle}
        />
        <span style={hintStyle}>{Math.round(1 / physics.fixedTimestep)} Hz</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Solver Iterations</span>
        <DecimalInput
          value={physics.solverIterations}
          onChange={(v) => update({ solverIterations: Math.round(v) })}
          min={1}
          max={64}
          decimals={0}
          step={1}
          style={inputStyle}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Substeps</span>
        <DecimalInput
          value={physics.substeps}
          onChange={(v) => update({ substeps: Math.round(v) })}
          min={1}
          max={10}
          decimals={0}
          step={1}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

export function SettingsPanel({ settingsManager, onClose }: SettingsPanelProps) {
  const [activeTab] = useState<Tab>('physics');

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={handleBackdrop}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Project Settings</span>
          <button style={closeBtnStyle} onClick={onClose}>{'\u2715'}</button>
        </div>
        <div style={tabBarStyle}>
          <button style={tabStyle(activeTab === 'physics')}>Physics</button>
        </div>
        <div style={bodyStyle}>
          {activeTab === 'physics' && <PhysicsTab settingsManager={settingsManager} />}
        </div>
      </div>
    </div>
  );
}
