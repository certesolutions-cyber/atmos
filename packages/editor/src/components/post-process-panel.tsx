import React, { useState, useCallback, useEffect } from 'react';
import type { RenderSystem } from '@atmos/renderer';
import type { EditorState } from '../editor-state.js';
import { DecimalInput } from './fields/decimal-input.js';
import { ColorField } from './fields/color-field.js';

interface PostProcessPanelProps {
  renderSystem: RenderSystem;
  editorState: EditorState;
}

const panelStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderTop: '1px solid #2a2a2a',
  background: '#1c1c1c',
  flexShrink: 0,
  overflowY: 'auto',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.5px',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
  userSelect: 'none',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#aaa',
};

const inputStyle: React.CSSProperties = {
  width: '60px',
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '3px',
  padding: '2px 4px',
  fontSize: '12px',
};

const checkboxStyle: React.CSSProperties = {
  accentColor: '#3388cc',
};

const subHeaderStyle: React.CSSProperties = {
  ...labelStyle,
  fontWeight: 600,
  color: '#999',
  marginBottom: '2px',
  marginTop: '6px',
};

function Row({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <DecimalInput value={value} min={min} max={max} step={step} style={inputStyle} onChange={onChange} />
    </div>
  );
}

export function PostProcessPanel({ renderSystem, editorState }: PostProcessPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Re-render when scene loads (post-process data applied externally) or play/pause toggles
  useEffect(() => {
    const unsub1 = editorState.on('sceneChanged', refresh);
    const unsub2 = editorState.on('pauseChanged', refresh);
    return () => { unsub1(); unsub2(); };
  }, [editorState, refresh]);

  return (
    <div style={panelStyle}>
      <div style={sectionHeaderStyle} onClick={() => setCollapsed(c => !c)}>
        {collapsed ? '\u25B6' : '\u25BC'} Post Processing
      </div>
      {!collapsed && (
        <div>
          {/* Exposure */}
          <div style={subHeaderStyle}>Exposure</div>
          <Row label="Exposure" value={renderSystem.exposure}
            min={0.1} max={5} step={0.05}
            onChange={v => { renderSystem.exposure = v; refresh(); }} />

          {/* SSAO */}
          <div style={{ ...subHeaderStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="checkbox" checked={renderSystem.ssaoEnabled} style={checkboxStyle}
              onChange={e => { renderSystem.ssaoEnabled = e.target.checked; refresh(); }} />
            SSAO
          </div>
          {renderSystem.ssaoEnabled && (
            <>
              <Row label="Radius" value={renderSystem.ssaoRadius}
                min={0.05} max={2} step={0.05}
                onChange={v => { renderSystem.ssaoRadius = v; refresh(); }} />
              <Row label="Intensity" value={renderSystem.ssaoIntensity}
                min={0} max={5} step={0.1}
                onChange={v => { renderSystem.ssaoIntensity = v; refresh(); }} />
              <Row label="Bias" value={renderSystem.ssaoBias}
                min={0} max={0.2} step={0.005}
                onChange={v => { renderSystem.ssaoBias = v; refresh(); }} />
            </>
          )}

          {/* Bloom */}
          <div style={subHeaderStyle}>Bloom</div>
          <Row label="Intensity" value={renderSystem.bloomIntensity}
            min={0} max={5} step={0.05}
            onChange={v => { renderSystem.bloomIntensity = v; refresh(); }} />
          <Row label="Threshold" value={renderSystem.bloomThreshold}
            min={0} max={10} step={0.1}
            onChange={v => { renderSystem.bloomThreshold = v; refresh(); }} />
          <Row label="Radius" value={renderSystem.bloomRadius}
            min={0} max={2} step={0.05}
            onChange={v => { renderSystem.bloomRadius = v; refresh(); }} />

          {/* Vignette */}
          <div style={subHeaderStyle}>Vignette</div>
          <Row label="Intensity" value={renderSystem.vignetteIntensity}
            min={0} max={1} step={0.05}
            onChange={v => { renderSystem.vignetteIntensity = v; refresh(); }} />
          <Row label="Radius" value={renderSystem.vignetteRadius}
            min={0.3} max={1.2} step={0.05}
            onChange={v => { renderSystem.vignetteRadius = v; refresh(); }} />

          {/* Fog */}
          <div style={{ ...subHeaderStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="checkbox" checked={renderSystem.fogEnabled} style={checkboxStyle}
              onChange={e => { renderSystem.fogEnabled = e.target.checked; refresh(); }} />
            Fog
          </div>
          {renderSystem.fogEnabled && (
            <>
              <div style={rowStyle}>
                <span style={labelStyle}>Mode</span>
                <select value={renderSystem.fogMode} style={inputStyle}
                  onChange={e => { renderSystem.fogMode = e.target.value as 'linear' | 'exponential'; refresh(); }}>
                  <option value="linear">Linear</option>
                  <option value="exponential">Exponential</option>
                </select>
              </div>
              {renderSystem.fogMode === 'exponential' && (
                <Row label="Density" value={renderSystem.fogDensity}
                  min={0.001} max={1} step={0.005}
                  onChange={v => { renderSystem.fogDensity = v; refresh(); }} />
              )}
              {renderSystem.fogMode === 'linear' && (
                <>
                  <Row label="Start" value={renderSystem.fogStart}
                    min={0} max={500} step={1}
                    onChange={v => { renderSystem.fogStart = v; refresh(); }} />
                  <Row label="End" value={renderSystem.fogEnd}
                    min={1} max={1000} step={1}
                    onChange={v => { renderSystem.fogEnd = v; refresh(); }} />
                </>
              )}
              <ColorField label="Color"
                value={Array.from(renderSystem.fogColor)}
                onChange={v => {
                  renderSystem.fogColor[0] = v[0]!;
                  renderSystem.fogColor[1] = v[1]!;
                  renderSystem.fogColor[2] = v[2]!;
                  refresh();
                }} />
            </>
          )}

          {/* Debug */}
          <div style={{ ...subHeaderStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="checkbox" checked={editorState.wireframeEnabled} style={checkboxStyle}
              onChange={e => { editorState.setWireframe(e.target.checked); refresh(); }} />
            Wireframe
          </div>
        </div>
      )}
    </div>
  );
}
