import type { EditorState } from '../editor-state.js';
import type { GizmoState } from '../gizmo-state.js';
import { deleteGameObject } from '../scene-operations.js';

export function installKeyboardShortcuts(
  editorState: EditorState,
  gizmoState: GizmoState | undefined,
): () => void {
  const handler = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (!editorState.paused) return;

    switch (e.key.toLowerCase()) {
      case 'w':
        editorState.setGizmoMode('translate');
        if (gizmoState) gizmoState.mode = 'translate';
        break;
      case 'e':
        editorState.setGizmoMode('rotate');
        if (gizmoState) gizmoState.mode = 'rotate';
        break;
      case 'r':
        editorState.setGizmoMode('scale');
        if (gizmoState) gizmoState.mode = 'scale';
        break;
      case 'g':
        editorState.toggleSnap();
        if (gizmoState) gizmoState.snapEnabled = editorState.snapEnabled;
        break;
      case 'delete':
      case 'backspace':
        if (editorState.selected) {
          deleteGameObject(editorState.scene, editorState.selected, editorState);
        }
        break;
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
