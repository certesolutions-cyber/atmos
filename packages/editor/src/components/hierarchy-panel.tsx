import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GameObject } from '@certe/atmos-core';
import type { EditorState } from '../editor-state.js';
import { HierarchyNode } from './hierarchy-node.js';
import { ContextMenu } from './context-menu.js';
import type { MenuItem } from './context-menu.js';
import {
  findObjectById,
  duplicateGameObject,
  deleteGameObject,
  canReparent,
  reparentGameObject,
  isPrefabLocked,
} from '../scene-operations.js';
import type { PrimitiveType } from '../editor-mount.js';

interface HierarchyPanelProps {
  editorState: EditorState;
  primitiveFactory?: (type: PrimitiveType, name: string) => GameObject;
  onFocusObject?: (obj: import('@certe/atmos-core').GameObject) => void;
  onDropModel?: (path: string, parent: import('@certe/atmos-core').GameObject | null) => void;
  onDropPrefab?: (path: string, parent: import('@certe/atmos-core').GameObject | null) => void;
  style?: React.CSSProperties;
}

const panelStyle: React.CSSProperties = {
  background: '#1c1c1c',
  borderRight: '1px solid #2a2a2a',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.5px',
  textTransform: 'uppercase' as const,
  borderBottom: '1px solid #2a2a2a',
  background: '#1c1c1c',
};

const searchStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: '11px',
  background: '#252525',
  color: '#b8b8b8',
  border: 'none',
  borderBottom: '1px solid #2a2a2a',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

function collectMatchingIds(
  obj: import('@certe/atmos-core').GameObject,
  filter: string,
  result: Set<number>,
): boolean {
  const nameMatch = obj.name.toLowerCase().includes(filter);
  let anyChildMatch = false;

  for (const child of obj.children) {
    if (collectMatchingIds(child, filter, result)) {
      anyChildMatch = true;
    }
  }

  if (nameMatch || anyChildMatch) {
    result.add(obj.id);
    return true;
  }
  return false;
}

function flattenHierarchy(
  roots: readonly import('@certe/atmos-core').GameObject[],
  filterMatch: Set<number> | null,
): import('@certe/atmos-core').GameObject[] {
  const result: import('@certe/atmos-core').GameObject[] = [];
  const visit = (obj: import('@certe/atmos-core').GameObject) => {
    if (filterMatch && !filterMatch.has(obj.id)) return;
    result.push(obj);
    for (const child of obj.children) visit(child);
  };
  for (const root of roots) visit(root);
  return result;
}

export function HierarchyPanel({ editorState, primitiveFactory, onFocusObject, onDropModel, onDropPrefab, style }: HierarchyPanelProps) {
  const [tick, setTick] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; obj: import('@certe/atmos-core').GameObject | null } | null>(null);
  const [renameId, setRenameId] = useState<number | null>(null);

  useEffect(() => {
    const unsub1 = editorState.on('sceneChanged', () => setTick((t) => t + 1));
    const unsub2 = editorState.on('selectionChanged', () => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
    };
  }, [editorState]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [lastClickedId, setLastClickedId] = useState<number | null>(null);

  // tick in deps forces recalc whenever selectionChanged fires a re-render
  const selectedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const obj of editorState.selection) ids.add(obj.id);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState, tick]);

  const roots = editorState.scene.roots;

  // Compute filter match set
  const filterMatch = useMemo(() => {
    if (!searchText.trim()) return null;
    const filter = searchText.trim().toLowerCase();
    const ids = new Set<number>();
    for (const root of roots) {
      collectMatchingIds(root, filter, ids);
    }
    return ids;
  }, [searchText, roots]);

  const handleReparent = useCallback((childId: number, newParentId: number | null) => {
    const scene = editorState.scene;
    const child = findObjectById(scene, childId);
    if (!child) return;

    const newParent = newParentId !== null ? findObjectById(scene, newParentId) : null;
    if (newParentId !== null && !newParent) return;
    if (!canReparent(child, newParent)) return;

    reparentGameObject(scene, child, newParent);
    refresh();
  }, [editorState, refresh]);

  const handleContextMenu = useCallback((e: React.MouseEvent, obj: import('@certe/atmos-core').GameObject) => {
    setContextMenu({ x: e.clientX, y: e.clientY, obj });
  }, []);

  const handleRenameComplete = useCallback((obj: import('@certe/atmos-core').GameObject, newName: string) => {
    if (newName.trim()) {
      obj.name = newName.trim();
    }
    setRenameId(null);
    refresh();
  }, [refresh]);

  const handleSelect = useCallback((obj: import('@certe/atmos-core').GameObject, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      editorState.toggleSelect(obj);
      setLastClickedId(obj.id);
    } else if (e.shiftKey && lastClickedId !== null) {
      const flat = flattenHierarchy(roots, filterMatch);
      const anchorIdx = flat.findIndex((o) => o.id === lastClickedId);
      const targetIdx = flat.findIndex((o) => o.id === obj.id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const lo = Math.min(anchorIdx, targetIdx);
        const hi = Math.max(anchorIdx, targetIdx);
        editorState.addToSelection(flat.slice(lo, hi + 1));
      } else {
        editorState.select(obj);
      }
    } else {
      editorState.select(obj);
      setLastClickedId(obj.id);
    }
  }, [editorState, lastClickedId, roots, filterMatch]);

  const primitiveTypes: PrimitiveType[] = ['cube', 'sphere', 'cylinder', 'plane', 'planeHd', 'camera', 'directionalLight', 'pointLight', 'spotLight'];

  const labelMap: Partial<Record<PrimitiveType, string>> = {
    planeHd: 'Plane HD',
    directionalLight: 'Directional Light',
    pointLight: 'Point Light',
    spotLight: 'Spot Light',
  };

  const buildContextMenuItems = (): MenuItem[] => {
    if (!contextMenu) return [];
    const parent = contextMenu.obj;
    const locked = parent ? isPrefabLocked(parent) : false;
    const isLockedChild = locked && !parent?.prefabSource;

    const createItems: MenuItem[] = locked ? [] : [
      {
        label: 'Create Empty',
        action: () => {
          const go = new GameObject('Empty');
          if (parent) go.setParent(parent);
          editorState.scene.add(go);
          refresh();
        },
      },
      ...(primitiveFactory ? primitiveTypes.map((type) => ({
        label: `Create ${labelMap[type] ?? type.charAt(0).toUpperCase() + type.slice(1)}`,
        action: () => {
          const name = labelMap[type] ?? (type === 'camera' ? 'Camera' : type.charAt(0).toUpperCase() + type.slice(1));
          const go = primitiveFactory(type, name);
          if (parent) go.setParent(parent);
          editorState.scene.add(go);
          editorState.select(go);
          refresh();
        },
      })) : []),
    ];

    if (!parent) return createItems;

    const items: MenuItem[] = [...createItems];

    // Duplicate is always allowed (creates a copy outside the locked subtree)
    items.push({
      label: 'Duplicate',
      action: () => {
        const copy = duplicateGameObject(editorState.scene, parent);
        editorState.select(copy);
        refresh();
      },
    });

    // Rename blocked for locked children
    if (!isLockedChild) {
      items.push({
        label: 'Rename',
        action: () => {
          setRenameId(parent.id);
        },
      });
    }

    // Delete: allowed for prefab root (deletes entire instance), blocked for locked children
    if (!isLockedChild) {
      items.push({
        label: 'Delete',
        action: () => {
          deleteGameObject(editorState.scene, parent, editorState);
          refresh();
        },
      });
    }

    return items;
  };

  const contextMenuItems = buildContextMenuItems();

  // Drop on panel background = reparent to root, model drop, or prefab drop
  const handlePanelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const prefabPath = e.dataTransfer.getData('application/x-atmos-prefab');
    if (prefabPath && onDropPrefab) {
      onDropPrefab(prefabPath, null);
      return;
    }
    const modelPath = e.dataTransfer.getData('application/x-atmos-model');
    if (modelPath && onDropModel) {
      onDropModel(modelPath, null);
      return;
    }
    const childId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(childId)) {
      handleReparent(childId, null);
    }
  };

  const handlePanelDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = (e.dataTransfer.types.includes('application/x-atmos-model') || e.dataTransfer.types.includes('application/x-atmos-prefab')) ? 'copy' : 'move';
  };

  return (
    <div style={{ ...panelStyle, ...style }}>
      <div style={headerStyle}>Hierarchy</div>
      <input
        style={searchStyle}
        placeholder="Search..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <div
        style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}
        onDrop={handlePanelDrop}
        onDragOver={handlePanelDragOver}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, obj: null });
        }}
      >
        {roots.map((root) => (
          <HierarchyNode
            key={root.id}
            gameObject={root}
            selectedIds={selectedIds}
            depth={0}
            onSelect={handleSelect}
            onDoubleClick={onFocusObject}
            onReparent={handleReparent}
            onContextMenu={handleContextMenu}
            onDropModel={onDropModel}
            onDropPrefab={onDropPrefab}
            filterMatch={filterMatch}
            renameId={renameId}
            onRenameComplete={handleRenameComplete}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
