import type { Plugin } from 'vite';

export interface AtmosPluginOptions {
  /** Directories to scan for the asset browser. Default: ['src'] */
  include?: string[];
  /** Names to exclude (directories / files). Default: common non-asset dirs */
  exclude?: string[];
  /** Entry file for auto-generated index.html. Default: 'src/main.ts' */
  entry?: string;
}

export declare function atmosPlugin(options?: AtmosPluginOptions): Plugin;

/** @deprecated Use atmosPlugin() instead */
export declare const atmosAssetsPlugin: typeof atmosPlugin;
