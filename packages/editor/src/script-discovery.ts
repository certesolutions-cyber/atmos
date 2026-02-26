import { Component, registerComponent, getComponentDef } from '@certe/atmos-core';
import type { ComponentDef, PropertyDef } from '@certe/atmos-core';
import type { ScriptAsset } from './asset-types.js';
import type { AssetEntry } from './asset-types.js';

/**
 * Process eagerly-loaded script modules and return ScriptAsset[].
 */
export function discoverScripts(
  modules: Record<string, Record<string, unknown>>,
): ScriptAsset[] {
  const scripts: ScriptAsset[] = [];

  for (const [modulePath, mod] of Object.entries(modules)) {
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isComponentClass(exported)) continue;

      const ctor = exported as new () => Component;
      const relPath = modulePath.replace('./', 'src/');

      if (!getComponentDef(ctor)) {
        const properties = extractEditorProperties(ctor);
        const def: ComponentDef = { name: exportName, properties };
        registerComponent(ctor, def);
      }

      scripts.push({ path: relPath, name: exportName, ctor });
    }
  }

  return scripts;
}

/**
 * Auto-discover scripts by scanning the asset tree and dynamically importing
 * .ts files under the given prefix. Works automatically in Vite dev mode.
 */
export async function autoDiscoverScripts(
  entries: AssetEntry[],
  scriptsPrefix = 'src/scripts',
): Promise<ScriptAsset[]> {
  const paths = collectTsFiles(entries, scriptsPrefix);
  if (paths.length === 0) return [];

  const scripts: ScriptAsset[] = [];
  for (const filePath of paths) {
    try {
      const mod = await import(/* @vite-ignore */ '/' + filePath) as Record<string, unknown>;
      for (const [exportName, exported] of Object.entries(mod)) {
        if (!isComponentClass(exported)) continue;
        const ctor = exported as new () => Component;
        if (!getComponentDef(ctor)) {
          registerComponent(ctor, {
            name: exportName,
            properties: extractEditorProperties(ctor),
          });
        }
        scripts.push({ path: filePath, name: exportName, ctor });
      }
    } catch {
      // Skip files that fail to import
    }
  }
  return scripts;
}

function collectTsFiles(entries: AssetEntry[], prefix: string): string[] {
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'file' && entry.extension === 'ts' && entry.path.startsWith(prefix)) {
      result.push(entry.path);
    }
    if (entry.children) {
      result.push(...collectTsFiles(entry.children, prefix));
    }
  }
  return result;
}

function isComponentClass(value: unknown): boolean {
  if (typeof value !== 'function') return false;
  let proto = Object.getPrototypeOf(value.prototype) as object | null;
  while (proto) {
    if (proto.constructor === Component) return true;
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return false;
}

function extractEditorProperties(ctor: new () => Component): PropertyDef[] {
  const withProps = ctor as unknown as { editorProperties?: PropertyDef[] };
  return withProps.editorProperties ?? [];
}
