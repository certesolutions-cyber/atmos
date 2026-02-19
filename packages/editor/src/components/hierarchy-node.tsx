import React, { useState } from 'react';
import type { GameObject } from '@atmos/core';

interface HierarchyNodeProps {
  gameObject: GameObject;
  selectedId: number | null;
  depth: number;
  onSelect: (obj: GameObject) => void;
  onDoubleClick?: (obj: GameObject) => void;
  onReparent?: (childId: number, newParentId: number | null) => void;
  onContextMenu?: (e: React.MouseEvent, obj: GameObject) => void;
  onDropModel?: (path: string, parent: GameObject | null) => void;
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
  gameObject, selectedId, depth, onSelect, onDoubleClick,
  onReparent, onContextMenu, onDropModel, filterMatch, renameId, onRenameComplete,
}: HierarchyNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const isSelected = gameObject.id === selectedId;
  const hasChildren = gameObject.children.length > 0;
  const isRenaming = renameId === gameObject.id;

  // If filter is active and this node doesn't match, hide
  if (filterMatch && !filterMatch.has(gameObject.id)) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(gameObject.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-atmos-model') ? 'copy' : 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
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
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        style={{
          ...rowStyle,
          paddingLeft: `${depth * 16 + 6}px`,
          background: dragOver ? '#1a3a5a' : isSelected ? '#1a4a7a' : 'transparent',
          color: isSelected ? '#e8e8e8' : '#b0b0b0',
          borderTop: dragOver ? '2px solid #3388cc' : '2px solid transparent',
        }}
        onClick={() => onSelect(gameObject)}
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
            selectedId={selectedId}
            depth={depth + 1}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onReparent={onReparent}
            onContextMenu={onContextMenu}
            onDropModel={onDropModel}
            filterMatch={filterMatch}
            renameId={renameId}
            onRenameComplete={onRenameComplete}
          />
        ))}
    </div>
  );
}
