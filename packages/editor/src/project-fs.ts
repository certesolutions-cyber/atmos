const IDB_KEY = 'atmos-project-handle';

export class ProjectFileSystem {
  private _root: FileSystemDirectoryHandle | null = null;
  private _serverMode = false;
  private _serverName = '';

  /** Called after writeFile / deleteFile completes. Set by start-editor to refresh asset browser. */
  onFileChanged: (() => void) | null = null;

  get isOpen(): boolean {
    return this._root !== null || this._serverMode;
  }

  get projectName(): string {
    if (this._serverMode) return this._serverName;
    return this._root?.name ?? '';
  }

  get isServerMode(): boolean {
    return this._serverMode;
  }

  /** Try connecting to Vite dev server. Returns true if the server is available. */
  async tryConnectDevServer(): Promise<boolean> {
    try {
      const res = await fetch('/__atmos_fs/info');
      if (!res.ok) return false;
      const data = await res.json() as { name: string };
      this._serverMode = true;
      this._serverName = data.name;
      return true;
    } catch {
      return false;
    }
  }

  /** Opens folder picker with mode:'readwrite'. Returns false if user cancels. */
  async open(): Promise<boolean> {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      this._root = handle;
      await persistHandle(handle);
      return true;
    } catch {
      return false;
    }
  }

  /** Restore handle from IndexedDB (returns true if permission still granted) */
  async tryRestore(): Promise<boolean> {
    const handle = await loadHandle();
    if (!handle) return false;
    const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      this._root = handle;
      return true;
    }
    try {
      const result = await (handle as any).requestPermission({ mode: 'readwrite' });
      if (result === 'granted') {
        this._root = handle;
        return true;
      }
    } catch {
      // User denied or popup blocked
    }
    return false;
  }

  async readFile(path: string): Promise<ArrayBuffer> {
    if (this._serverMode) {
      const res = await fetch(`/__atmos_fs/read?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
      return res.arrayBuffer();
    }
    const fileHandle = await this._resolveFile(path);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  async readTextFile(path: string): Promise<string> {
    if (this._serverMode) {
      const res = await fetch(`/__atmos_fs/read-text?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
      return res.text();
    }
    const fileHandle = await this._resolveFile(path);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async writeFile(path: string, data: ArrayBuffer | string): Promise<void> {
    if (this._serverMode) {
      const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const res = await fetch(`/__atmos_fs/write?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        body,
      });
      if (!res.ok) throw new Error(`Failed to write ${path}: ${res.status}`);
      this.onFileChanged?.();
      return;
    }
    const parts = path.split('/');
    const fileName = parts.pop()!;
    const dir = parts.length > 0 ? await this.ensureDir(parts.join('/')) : this._root!;
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    this.onFileChanged?.();
  }

  async deleteFile(path: string): Promise<void> {
    if (this._serverMode) {
      const res = await fetch(`/__atmos_fs/delete?path=${encodeURIComponent(path)}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to delete ${path}: ${res.status}`);
      this.onFileChanged?.();
      return;
    }
    const parts = path.split('/');
    const fileName = parts.pop()!;
    const dir = await this._resolveDir(parts.join('/') || '.');
    await dir.removeEntry(fileName);
    this.onFileChanged?.();
  }

  async exists(path: string): Promise<boolean> {
    if (this._serverMode) {
      try {
        const res = await fetch(`/__atmos_fs/exists?path=${encodeURIComponent(path)}`);
        if (!res.ok) return false;
        return (await res.json()) as boolean;
      } catch {
        return false;
      }
    }
    try {
      await this._resolveFile(path);
      return true;
    } catch {
      try {
        const parts = path.split('/');
        await this._resolveDir(parts.join('/'));
        return true;
      } catch {
        return false;
      }
    }
  }

  async listFiles(dirPath?: string): Promise<string[]> {
    if (this._serverMode) {
      const q = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/__atmos_fs/list${q}`);
      if (!res.ok) return [];
      return (await res.json()) as string[];
    }
    const root = dirPath ? await this._resolveDir(dirPath) : this._root!;
    const prefix = dirPath ? `${dirPath}/` : '';
    return this._listRecursive(root, prefix);
  }

  async ensureDir(path: string): Promise<FileSystemDirectoryHandle> {
    if (this._serverMode) {
      await fetch(`/__atmos_fs/mkdir?path=${encodeURIComponent(path)}`, { method: 'POST' });
      // Return a dummy handle — not used in server mode
      return {} as FileSystemDirectoryHandle;
    }
    this._assertOpen();
    let dir = this._root!;
    for (const segment of path.split('/')) {
      if (!segment) continue;
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    return dir;
  }

  private _assertOpen(): void {
    if (!this._root && !this._serverMode) throw new Error('No project open');
  }

  private async _resolveFile(path: string): Promise<FileSystemFileHandle> {
    this._assertOpen();
    const parts = path.split('/');
    const fileName = parts.pop()!;
    let dir = this._root!;
    for (const segment of parts) {
      if (!segment) continue;
      dir = await dir.getDirectoryHandle(segment);
    }
    return dir.getFileHandle(fileName);
  }

  private async _resolveDir(path: string): Promise<FileSystemDirectoryHandle> {
    this._assertOpen();
    let dir = this._root!;
    if (path === '.') return dir;
    for (const segment of path.split('/')) {
      if (!segment) continue;
      dir = await dir.getDirectoryHandle(segment);
    }
    return dir;
  }

  private async _listRecursive(dir: FileSystemDirectoryHandle, prefix: string): Promise<string[]> {
    const results: string[] = [];
    for await (const [name, handle] of (dir as any).entries()) {
      if (handle.kind === 'file') {
        results.push(prefix + name);
      } else {
        const sub = await this._listRecursive(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
        results.push(...sub);
      }
    }
    return results.sort();
  }
}

// ---- IndexedDB handle persistence ---- //

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('atmos-editor', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('handles');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIDB();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(handle, IDB_KEY);
  db.close();
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(IDB_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}
