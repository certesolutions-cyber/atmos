import type { Component } from '@atmos/core';

/** A single file or folder in the project asset tree */
export interface AssetEntry {
  /** Relative path from project root, e.g. "src/scripts/Rotator.ts" */
  path: string;
  /** File name, e.g. "Rotator.ts" */
  name: string;
  kind: 'file' | 'directory';
  /** Extension without dot, e.g. "ts". Empty string for directories. */
  extension: string;
  /** Child entries (directories only) */
  children?: AssetEntry[];
}

/** Response shape from the Vite plugin /__atmos_assets endpoint */
export interface AssetListResponse {
  root: string;
  entries: AssetEntry[];
}

/** HMR event payload for file changes */
export interface AssetChangeEvent {
  kind: 'add' | 'change' | 'unlink';
  path: string;
}

/** A discovered script that can be attached to GameObjects */
export interface ScriptAsset {
  /** Relative path to the .ts file */
  path: string;
  /** Display name (class name) */
  name: string;
  /** The Component constructor */
  ctor: new () => Component;
}
