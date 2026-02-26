import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { EditorState } from '../editor-state.js';
import type { AssetEntry, ScriptAsset } from '../asset-types.js';
import type { GameObject } from '@certe/atmos-core';

interface AssetBrowserPanelProps {
  editorState: EditorState;
  onAttachScript?: (script: ScriptAsset, go: GameObject) => void;
  onLoadModel?: (entry: AssetEntry) => void;
  onLoadScene?: (entry: AssetEntry) => void;
  style?: React.CSSProperties;
}

/* ── Styles ─────────────────────────────────────────── */

const panelStyle: React.CSSProperties = {
  background: '#1c1c1c',
  borderTop: '1px solid #2a2a2a',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '5px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #2a2a2a',
  background: '#1c1c1c',
  flexShrink: 0,
};

const breadcrumbStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#666',
  fontWeight: 400,
  letterSpacing: 0,
};

const breadcrumbLinkStyle: React.CSSProperties = {
  color: '#6ab0d6',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  fontSize: '11px',
  fontFamily: 'inherit',
  padding: 0,
};

const searchStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: '#252525',
  border: '1px solid #3a3a3a',
  borderRadius: '3px',
  color: '#b8b8b8',
  fontSize: '10px',
  padding: '2px 6px',
  width: '120px',
  fontFamily: 'inherit',
  outline: 'none',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '2px 0',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 10px',
  fontSize: '11px',
  color: '#b8b8b8',
  cursor: 'pointer',
  userSelect: 'none',
};

const rowHoverBg = '#2a2a3a';
const rowSelectedBg = '#1a4a7a';

const badgeBase: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  padding: '1px 4px',
  borderRadius: '2px',
  letterSpacing: '0.3px',
  flexShrink: 0,
  minWidth: '24px',
  textAlign: 'center',
};

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  ts: { bg: '#1a4a7a', color: '#7ab8e8' },
  tsx: { bg: '#1a4a7a', color: '#7ab8e8' },
  js: { bg: '#4a4a1a', color: '#d8d87a' },
  json: { bg: '#3a3a3a', color: '#999' },
  html: { bg: '#6a2a2a', color: '#e88' },
  css: { bg: '#2a4a2a', color: '#8c8' },
  wgsl: { bg: '#4a2a5a', color: '#b88ae8' },
  glb: { bg: '#5a3a1a', color: '#e8a848' },
  gltf: { bg: '#5a3a1a', color: '#e8a848' },
  dir: { bg: '#3a3a2a', color: '#c8b888' },
};

const MODEL_EXTENSIONS = new Set(['glb', 'gltf']);
const MATERIAL_EXTENSION = '.mat.json';
const SCENE_EXTENSION = '.scene.json';
const TEXTURE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

const contextMenuStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#252525',
  border: '1px solid #3a3a3a',
  borderRadius: '4px',
  padding: '4px 0',
  zIndex: 2000,
  minWidth: '160px',
  boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
};

const contextItemStyle: React.CSSProperties = {
  padding: '5px 12px',
  fontSize: '11px',
  cursor: 'pointer',
  color: '#b8b8b8',
};

/* ── Helpers ────────────────────────────────────────── */

function findEntryAtPath(entries: AssetEntry[], pathParts: string[]): AssetEntry[] {
  let current = entries;
  for (const part of pathParts) {
    const dir = current.find((e) => e.name === part && e.kind === 'directory');
    if (!dir?.children) return [];
    current = dir.children;
  }
  return current;
}

function badgeFor(entry: AssetEntry): { label: string; bg: string; color: string } {
  if (entry.kind === 'directory') {
    const c = BADGE_COLORS['dir']!;
    return { label: 'DIR', ...c };
  }
  const ext = entry.extension.toLowerCase();
  const c = BADGE_COLORS[ext] ?? { bg: '#333', color: '#888' };
  return { label: ext.toUpperCase() || '---', ...c };
}

/* ── Component ──────────────────────────────────────── */

export function AssetBrowserPanel({ editorState, onAttachScript, onLoadModel, onLoadScene, style }: AssetBrowserPanelProps) {
  const [, setTick] = useState(0);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: AssetEntry } | null>(null);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const unsub1 = editorState.on('assetsChanged', refresh);
    const unsub2 = editorState.on('scriptsChanged', refresh);
    return () => { unsub1(); unsub2(); };
  }, [editorState]);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const entries = editorState.assetEntries;
  const scriptSet = useMemo(
    () => new Set(editorState.scriptAssets.map((s) => s.path)),
    [editorState.scriptAssets],
  );

  const visibleEntries = useMemo(() => {
    const items = findEntryAtPath(entries, currentPath);
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter((e) => e.name.toLowerCase().includes(lower));
  }, [entries, currentPath, search]);

  const navigateInto = useCallback((entry: AssetEntry) => {
    if (entry.kind === 'directory') {
      setCurrentPath((p) => [...p, entry.name]);
      setSearch('');
      setSelectedPath(null);
    }
  }, []);

  const navigateTo = useCallback((index: number) => {
    setCurrentPath((p) => p.slice(0, index));
    setSearch('');
    setSelectedPath(null);
  }, []);

  const findScript = useCallback(
    (entry: AssetEntry): ScriptAsset | undefined =>
      editorState.scriptAssets.find((s) => s.path === entry.path),
    [editorState.scriptAssets],
  );

  const handleAttach = useCallback(
    (entry: AssetEntry) => {
      const script = findScript(entry);
      if (!script || !editorState.selected || !onAttachScript) return;
      onAttachScript(script, editorState.selected);
    },
    [findScript, editorState, onAttachScript],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: AssetEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  // Breadcrumb parts
  const breadcrumbs = ['Project', ...currentPath];

  return (
    <div style={{ ...panelStyle, ...style }}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ textTransform: 'uppercase' }}>Project</span>
        <span style={breadcrumbStyle}>
          {breadcrumbs.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ margin: '0 3px', color: '#555' }}>/</span>}
              {i < breadcrumbs.length - 1 ? (
                <button style={breadcrumbLinkStyle} onClick={() => navigateTo(i)}>
                  {part}
                </button>
              ) : (
                <span style={{ color: '#999' }}>{part}</span>
              )}
            </React.Fragment>
          ))}
        </span>
        <input
          style={searchStyle}
          placeholder="Filter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* File list */}
      <div style={listStyle}>
        {visibleEntries.length === 0 && (
          <div style={{ padding: '12px', color: '#555', fontSize: '11px' }}>
            {entries.length === 0 ? 'No assets available' : 'No matching files'}
          </div>
        )}
        {visibleEntries.map((entry) => {
          const badge = badgeFor(entry);
          const isScript = scriptSet.has(entry.path);
          const isModel = MODEL_EXTENSIONS.has(entry.extension.toLowerCase());
          const isMaterial = entry.name.endsWith(MATERIAL_EXTENSION);
          const isScene = entry.name.endsWith(SCENE_EXTENSION);
          const isTexture = TEXTURE_EXTENSIONS.has(entry.extension.toLowerCase());
          const isSelected = selectedPath === entry.path;

          return (
            <div
              key={entry.path}
              draggable={isScript || isModel || isMaterial || isTexture}
              style={{
                ...rowStyle,
                background: isSelected ? rowSelectedBg : 'transparent',
              }}
              onClick={() => {
                setSelectedPath(entry.path);
                if (entry.name.endsWith(MATERIAL_EXTENSION)) {
                  editorState.selectMaterial(entry.path);
                } else {
                  // Deselect material when clicking non-material files
                  if (editorState.selectedMaterialPath) editorState.selectMaterial(null);
                }
              }}
              onDoubleClick={() => {
                if (entry.kind === 'directory') navigateInto(entry);
                else if (isScene && onLoadScene) {
                  const name = entry.name.replace(/\.scene\.json$/, '');
                  if (confirm(`Load scene "${name}"?`)) onLoadScene(entry);
                }
                else if (isScript) handleAttach(entry);
                else if (isModel && onLoadModel) onLoadModel(entry);
              }}
              onContextMenu={(e) => handleContextMenu(e, entry)}
              onDragStart={(e) => {
                if (isScript) {
                  e.dataTransfer.setData('application/x-atmos-script', entry.path);
                  e.dataTransfer.effectAllowed = 'copy';
                } else if (isModel) {
                  e.dataTransfer.setData('application/x-atmos-model', entry.path);
                  e.dataTransfer.effectAllowed = 'copy';
                } else if (isMaterial) {
                  e.dataTransfer.setData('application/x-atmos-material', entry.path);
                  e.dataTransfer.effectAllowed = 'copy';
                } else if (isTexture) {
                  e.dataTransfer.setData('application/x-atmos-texture', entry.path);
                  e.dataTransfer.effectAllowed = 'copy';
                } else {
                  e.preventDefault();
                }
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = rowHoverBg;
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <span style={{ ...badgeBase, background: badge.bg, color: badge.color }}>
                {badge.label}
              </span>
              <span style={isScript ? { color: '#8cd68c' } : isModel ? { color: '#e8a848' } : isMaterial ? { color: '#b888e8' } : undefined}>
                {entry.name}
              </span>
              {isScript && (
                <span style={{ fontSize: '9px', color: '#5a8a5a', marginLeft: '4px' }}>
                  Script
                </span>
              )}
              {isModel && (
                <span style={{ fontSize: '9px', color: '#8a6a2a', marginLeft: '4px' }}>
                  Model
                </span>
              )}
              {isMaterial && (
                <span style={{ fontSize: '9px', color: '#6a4a8a', marginLeft: '4px' }}>
                  Material
                </span>
              )}
              {isScene && (
                <span style={{ fontSize: '9px', color: '#5a8a8a', marginLeft: '4px' }}>
                  Scene
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div style={{ ...contextMenuStyle, left: contextMenu.x, top: contextMenu.y }}>
          {scriptSet.has(contextMenu.entry.path) && editorState.selected && onAttachScript && (
            <div
              style={contextItemStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#3a5a8a'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onClick={() => handleAttach(contextMenu.entry)}
            >
              Add to {editorState.selected.name}
            </div>
          )}
          {MODEL_EXTENSIONS.has(contextMenu.entry.extension.toLowerCase()) && onLoadModel && (
            <div
              style={contextItemStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#3a5a8a'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onClick={() => onLoadModel(contextMenu.entry)}
            >
              Add to Scene
            </div>
          )}
          <div
            style={{ ...contextItemStyle, color: '#666' }}
          >
            {contextMenu.entry.path}
          </div>
        </div>
      )}
    </div>
  );
}
