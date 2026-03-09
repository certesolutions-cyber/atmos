import React, { useState, useCallback, useEffect } from 'react';
import type { EditorState } from '../editor-state.js';
import type { BrushMode } from '../editor-state.js';
import { DecimalInput } from './fields/decimal-input.js';

export interface TreeBrushConfig {
  radius: number;
  density: number;
  speciesIndex: number;
  scaleMin: number;
  scaleMax: number;
  eraseMode: boolean;
}

export interface DetailBrushConfig {
  radius: number;
  density: number;
  typeIndex: number;
  scaleMin: number;
  scaleMax: number;
  eraseMode: boolean;
}

export interface TextureBrushConfig {
  radius: number;
  strength: number;
  layerIndex: number;
}

interface TreeBrushPanelProps {
  editorState: EditorState;
  brushConfig: TreeBrushConfig;
  onConfigChange: (config: TreeBrushConfig) => void;
  detailBrushConfig: DetailBrushConfig;
  onDetailConfigChange: (config: DetailBrushConfig) => void;
  textureBrushConfig: TextureBrushConfig;
  onTextureConfigChange: (config: TextureBrushConfig) => void;
}

const panelStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderTop: '1px solid #2a2a2a',
  background: '#1c1c1c',
  flexShrink: 0,
  overflowY: 'auto',
};

const headerStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom: '4px',
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

const checkboxStyle: React.CSSProperties = {
  accentColor: '#3388cc',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px',
  fontSize: '11px',
  background: active ? '#3388cc' : '#2a2a2a',
  color: active ? '#fff' : '#888',
  border: '1px solid #555',
  borderRadius: '3px',
  cursor: 'pointer',
});

export function TreeBrushPanel({
  editorState, brushConfig, onConfigChange,
  detailBrushConfig, onDetailConfigChange,
  textureBrushConfig, onTextureConfigChange,
}: TreeBrushPanelProps) {
  const [isActive, setIsActive] = useState(editorState.tool === 'treeBrush');
  const [brushMode, setBrushMode] = useState<BrushMode>(editorState.brushMode);

  useEffect(() => {
    return editorState.on('toolChanged', () => {
      setIsActive(editorState.tool === 'treeBrush');
    });
  }, [editorState]);

  const toggleTool = useCallback(() => {
    editorState.setTool(editorState.tool === 'treeBrush' ? 'select' : 'treeBrush');
  }, [editorState]);

  const switchMode = useCallback((mode: BrushMode) => {
    editorState.brushMode = mode;
    setBrushMode(mode);
  }, [editorState]);

  const updateTree = useCallback((partial: Partial<TreeBrushConfig>) => {
    onConfigChange({ ...brushConfig, ...partial });
  }, [brushConfig, onConfigChange]);

  const updateDetail = useCallback((partial: Partial<DetailBrushConfig>) => {
    onDetailConfigChange({ ...detailBrushConfig, ...partial });
  }, [detailBrushConfig, onDetailConfigChange]);

  const updateTexture = useCallback((partial: Partial<TextureBrushConfig>) => {
    onTextureConfigChange({ ...textureBrushConfig, ...partial });
  }, [textureBrushConfig, onTextureConfigChange]);

  return React.createElement('div', { style: panelStyle },
    React.createElement('div', { style: { ...headerStyle, display: 'flex', alignItems: 'center', gap: '6px' } },
      React.createElement('button', {
        onClick: toggleTool,
        style: {
          padding: '2px 8px',
          fontSize: '11px',
          background: isActive ? '#3388cc' : '#333',
          color: '#eee',
          border: '1px solid #555',
          borderRadius: '3px',
          cursor: 'pointer',
        },
      }, isActive ? 'Deactivate' : 'Activate'),
      'Brush Tool',
    ),
    isActive && React.createElement(React.Fragment, null,
      // Mode tabs
      React.createElement('div', { style: { display: 'flex', gap: '4px', margin: '6px 0' } },
        React.createElement('button', { style: tabStyle(brushMode === 'tree'), onClick: () => switchMode('tree') }, 'Tree'),
        React.createElement('button', { style: tabStyle(brushMode === 'detail'), onClick: () => switchMode('detail') }, 'Detail'),
        React.createElement('button', { style: tabStyle(brushMode === 'texture'), onClick: () => switchMode('texture') }, 'Texture'),
      ),

      // Tree mode controls
      brushMode === 'tree' && React.createElement(React.Fragment, null,
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Radius'),
          React.createElement(DecimalInput, {
            value: brushConfig.radius,
            min: 1, max: 100, step: 1,
            onChange: (v: number) => updateTree({ radius: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Density'),
          React.createElement(DecimalInput, {
            value: brushConfig.density,
            min: 0.01, max: 5, step: 0.05,
            onChange: (v: number) => updateTree({ density: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Species'),
          React.createElement(DecimalInput, {
            value: brushConfig.speciesIndex,
            min: 0, max: 10, step: 1,
            onChange: (v: number) => updateTree({ speciesIndex: Math.floor(v) }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Scale Min'),
          React.createElement(DecimalInput, {
            value: brushConfig.scaleMin,
            min: 0.1, max: 5, step: 0.05,
            onChange: (v: number) => updateTree({ scaleMin: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Scale Max'),
          React.createElement(DecimalInput, {
            value: brushConfig.scaleMax,
            min: 0.1, max: 5, step: 0.05,
            onChange: (v: number) => updateTree({ scaleMax: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Erase Mode'),
          React.createElement('input', {
            type: 'checkbox',
            style: checkboxStyle,
            checked: brushConfig.eraseMode,
            onChange: () => updateTree({ eraseMode: !brushConfig.eraseMode }),
          }),
        ),
      ),

      // Detail mode controls
      brushMode === 'detail' && React.createElement(React.Fragment, null,
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Radius'),
          React.createElement(DecimalInput, {
            value: detailBrushConfig.radius,
            min: 1, max: 50, step: 1,
            onChange: (v: number) => updateDetail({ radius: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Density'),
          React.createElement(DecimalInput, {
            value: detailBrushConfig.density,
            min: 0.5, max: 50, step: 0.5,
            onChange: (v: number) => updateDetail({ density: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Type'),
          React.createElement(DecimalInput, {
            value: detailBrushConfig.typeIndex,
            min: 0, max: 10, step: 1,
            onChange: (v: number) => updateDetail({ typeIndex: Math.floor(v) }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Scale Min'),
          React.createElement(DecimalInput, {
            value: detailBrushConfig.scaleMin,
            min: 0.1, max: 5, step: 0.05,
            onChange: (v: number) => updateDetail({ scaleMin: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Scale Max'),
          React.createElement(DecimalInput, {
            value: detailBrushConfig.scaleMax,
            min: 0.1, max: 5, step: 0.05,
            onChange: (v: number) => updateDetail({ scaleMax: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Erase Mode'),
          React.createElement('input', {
            type: 'checkbox',
            style: checkboxStyle,
            checked: detailBrushConfig.eraseMode,
            onChange: () => updateDetail({ eraseMode: !detailBrushConfig.eraseMode }),
          }),
        ),
      ),

      // Texture mode controls
      brushMode === 'texture' && React.createElement(React.Fragment, null,
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Radius'),
          React.createElement(DecimalInput, {
            value: textureBrushConfig.radius,
            min: 1, max: 100, step: 1,
            onChange: (v: number) => updateTexture({ radius: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Strength'),
          React.createElement(DecimalInput, {
            value: textureBrushConfig.strength,
            min: 0.01, max: 1, step: 0.05,
            onChange: (v: number) => updateTexture({ strength: v }),
          }),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, 'Layer'),
          React.createElement(DecimalInput, {
            value: textureBrushConfig.layerIndex,
            min: 0, max: 3, step: 1,
            onChange: (v: number) => updateTexture({ layerIndex: Math.floor(v) }),
          }),
        ),
      ),
    ),
  );
}
