import type { AssetEntry, AssetListResponse, AssetChangeEvent } from './asset-types.js';

type AssetTreeListener = () => void;

/**
 * Browser-side client that fetches the project file tree from the
 * Vite dev server /__atmos_assets endpoint and subscribes to HMR
 * events for live updates when files change on disk.
 */
export class AssetBrowserClient {
  private _entries: AssetEntry[] = [];
  private _root = '';
  private readonly _listeners = new Set<AssetTreeListener>();
  private _disposed = false;

  get entries(): AssetEntry[] {
    return this._entries;
  }
  get root(): string {
    return this._root;
  }

  /** Fetch initial tree and subscribe to HMR file-change events */
  async init(): Promise<void> {
    await this._fetchTree();

    // Subscribe to Vite HMR custom events when available
    const meta = import.meta as unknown as { hot?: { on(event: string, cb: (data: AssetChangeEvent) => void): void } };
    if (meta.hot) {
      meta.hot.on('atmos:asset-change', (_event: AssetChangeEvent) => {
        if (this._disposed) return;
        this._fetchTree();
      });
    }
  }

  /** Register a listener called whenever the file tree updates. Returns unsubscribe fn. */
  onChange(fn: AssetTreeListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  dispose(): void {
    this._disposed = true;
    this._listeners.clear();
  }

  private async _fetchTree(): Promise<void> {
    try {
      const res = await fetch('/__atmos_assets');
      if (!res.ok) {
        console.warn('[AssetBrowser] Asset listing endpoint not available');
        return;
      }
      const data: AssetListResponse = await res.json();
      this._root = data.root;
      this._entries = data.entries;
      this._notify();
    } catch {
      // Endpoint not available (e.g. production build) — ignore
    }
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}
