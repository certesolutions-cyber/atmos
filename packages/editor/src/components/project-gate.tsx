import React, { useState, useEffect } from 'react';
import type { ProjectFileSystem } from '../project-fs.js';

interface ProjectGateProps {
  projectFs: ProjectFileSystem;
  onProjectOpened: () => void;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  background: '#181818',
  color: '#c8c8c8',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  gap: '16px',
};

const btnStyle: React.CSSProperties = {
  background: '#2c6fba',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '10px 28px',
  fontSize: '14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#333',
  color: '#b8b8b8',
  border: '1px solid #444',
};

const supportsApi = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export function ProjectGate({ projectFs, onProjectOpened }: ProjectGateProps) {
  const [storedName, setStoredName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Check if we have a stored handle name
    async function check() {
      try {
        const db = await openIDBReadonly();
        if (!db) return;
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('atmos-project-handle');
        req.onsuccess = () => {
          const handle = req.result as FileSystemDirectoryHandle | undefined;
          if (handle) setStoredName(handle.name);
          db.close();
        };
        req.onerror = () => db.close();
      } catch { /* no stored handle */ }
    }
    check();
  }, []);

  if (!supportsApi) {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: '18px', fontWeight: 600 }}>Atmos Editor</div>
        <div style={{ color: '#888', maxWidth: '360px', textAlign: 'center', lineHeight: '1.6' }}>
          The File System Access API is required.
          Please use <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Brave</strong>.
        </div>
      </div>
    );
  }

  const handleOpen = async () => {
    setBusy(true);
    const ok = await projectFs.open();
    setBusy(false);
    if (ok) onProjectOpened();
  };

  const handleRestore = async () => {
    setBusy(true);
    const ok = await projectFs.tryRestore();
    setBusy(false);
    if (ok) onProjectOpened();
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>Atmos Editor</div>
      <div style={{ color: '#888', fontSize: '13px' }}>
        Select a project folder to get started.
      </div>
      <button style={btnStyle} onClick={handleOpen} disabled={busy}>
        Open Project
      </button>
      {storedName && (
        <button style={secondaryBtnStyle} onClick={handleRestore} disabled={busy}>
          Reopen "{storedName}"
        </button>
      )}
    </div>
  );
}

function openIDBReadonly(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('atmos-editor', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
