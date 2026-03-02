import React, { useState } from 'react';
import type { GameObject } from '@certe/atmos-core';

interface HierarchyNodeProps {
  gameObject: GameObject;
  selectedIds: ReadonlySet<number>;
  depth: number;
  onSelect: (obj: GameObject, e: React.MouseEvent) => void;
  onDoubleClick?: (obj: GameObject) => void;
  onReparent?: (childId: number, newParentId: number | null) => void;
  onContextMenu?: (e: React.MouseEvent, obj: GameObject) => void;
  onDropModel?: (path: string, parent: GameObject | null) => void;
  onDropPrefab?: (path: string, parent: GameObject | null) => void;
  filterMatch?: Set<number> | null;
  renameId?: number | null;
  onRenameComplete?: (obj: GameObject, newName: string) => void;
}

const rowStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '3px 6px',
  fontSize: '12px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  lineHeight: '18px',
};

export function HierarchyNode({
  gameObject, selectedIds, depth, onSelect, onDoubleClick,
  onReparent, onContextMenu, onDropModel, onDropPrefab, filterMatch, renameId, onRenameComplete,
}: HierarchyNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isSelected = selectedIds.has(gameObject.id);
  const hasChildren = gameObject.children.length > 0;
  const isRenaming = renameId === gameObject.id;
  const isPrefabRoot = !!gameObject.prefabSource;
  const isPrefab = gameObject.prefabLocked;
  const isLockedChild = isPrefab && !isPrefabRoot;

  // If filter is active and this node doesn't match, hide
  if (filterMatch && !filterMatch.has(gameObject.id)) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(gameObject.id));
    e.dataTransfer.effectAllowed = 'all';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = (e.dataTransfer.types.includes('application/x-atmos-model') || e.dataTransfer.types.includes('application/x-atmos-prefab')) ? 'copy' : 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const prefabPath = e.dataTransfer.getData('application/x-atmos-prefab');
    if (prefabPath && onDropPrefab) {
      onDropPrefab(prefabPath, gameObject);
      return;
    }
    const modelPath = e.dataTransfer.getData('application/x-atmos-model');
    if (modelPath && onDropModel) {
      onDropModel(modelPath, gameObject);
      return;
    }
    const childId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(childId) && childId !== gameObject.id && onReparent) {
      onReparent(childId, gameObject.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, gameObject);
  };

  return (
    <div>
      <div
        draggable={!isLockedChild}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        style={{
          ...rowStyle,
          paddingLeft: `${depth * 16 + 6}px`,
          background: dragOver ? '#1a3a5a' : isSelected ? '#1a4a7a' : 'transparent',
          color: isPrefab
            ? (isSelected ? '#e8c8ff' : '#b888e8')
            : (isSelected ? '#e8e8e8' : '#b0b0b0'),
          borderTop: dragOver ? '2px solid #3388cc' : '2px solid transparent',
        }}
        onClick={(e) => onSelect(gameObject, e)}
        onDoubleClick={() => onDoubleClick?.(gameObject)}
      >
        {hasChildren && (
          <span
            style={{ marginRight: '4px', display: 'inline-block', width: '12px' }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        )}
        {!hasChildren && <span style={{ marginRight: '4px', display: 'inline-block', width: '12px' }} />}
        {isPrefabRoot && <span style={{ marginRight: '3px', fontSize: '10px' }} title="Prefab (locked)">{'\uD83D\uDD12'}</span>}
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={gameObject.name}
            style={{
              background: '#333',
              color: '#fff',
              border: '1px solid #4a9eff',
              fontSize: '12px',
              padding: '1px 4px',
              width: '80%',
              outline: 'none',
            }}
            onBlur={(e) => onRenameComplete?.(gameObject, e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRenameComplete?.(gameObject, e.currentTarget.value);
              } else if (e.key === 'Escape') {
                onRenameComplete?.(gameObject, gameObject.name);
              }
            }}
          />
        ) : (
          gameObject.name
        )}
      </div>
      {expanded &&
        gameObject.children.map((child) => (
          <HierarchyNode
            key={child.id}
            gameObject={child}
            selectedIds={selectedIds}
            depth={depth + 1}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onReparent={onReparent}
            onContextMenu={onContextMenu}
            onDropModel={onDropModel}
            onDropPrefab={onDropPrefab}
            filterMatch={filterMatch}
            renameId={renameId}
            onRenameComplete={onRenameComplete}
          />
        ))}
    </div>
  );
}
