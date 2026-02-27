const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_EXCLUDE = new Set([
  'node_modules', '.git', 'dist', '.vite', '.turbo', '__pycache__',
]);

function scanDirectory(dirPath, relativeTo, exclude) {
  const entries = [];
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const item of items) {
    if (exclude.has(item.name) || item.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, item.name);
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
    if (item.isDirectory()) {
      entries.push({
        path: relPath,
        name: item.name,
        kind: 'directory',
        extension: '',
        children: scanDirectory(fullPath, relativeTo, exclude),
      });
    } else {
      const ext = path.extname(item.name).slice(1);
      entries.push({
        path: relPath,
        name: item.name,
        kind: 'file',
        extension: ext,
      });
    }
  }
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function generateEditorHtml(entry) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Atmos Editor</title>
</head>
<body>
  <script type="module" src="/${entry}"></script>
</body>
</html>`;
}

function generatePlayerHtml(entry) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Atmos Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #atmos-container { position: relative; width: 100%; height: 100%; }
    #atmos-canvas { width: 100%; height: 100%; display: block; }
    #atmos-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    #atmos-ui * { pointer-events: auto; }
  </style>
</head>
<body>
  <div id="atmos-container">
    <canvas id="atmos-canvas"></canvas>
    <div id="atmos-ui"></div>
  </div>
  <script type="module" src="/${entry}"></script>
</body>
</html>`;
}

const VIRTUAL_BUILD_ENTRY = 'virtual:atmos-build-entry';
const RESOLVED_BUILD_ENTRY = '\0virtual:atmos-build-entry';

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);
    if (item.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Collect body data from an IncomingMessage. */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** @param {import('./vite-plugin.d.ts').AtmosPluginOptions} [options] */
function atmosPlugin(options) {
  const include = options?.include ?? ['src'];
  const exclude = new Set([...DEFAULT_EXCLUDE, ...(options?.exclude ?? [])]);
  const entry = options?.entry ?? 'src/main.ts';
  let root = '';
  let generatedIndex = '';
  let isBuild = false;

  return {
    name: 'atmos-editor',

    config(cfg, { command }) {
      root = cfg.root || process.cwd();
      isBuild = command === 'build';

      if (isBuild) {
        // In build mode, generate player HTML (not editor)
        const indexPath = path.resolve(root, 'index.html');
        const userHasIndex = fs.existsSync(indexPath);
        if (!userHasIndex) {
          fs.writeFileSync(indexPath, generatePlayerHtml(VIRTUAL_BUILD_ENTRY));
          generatedIndex = indexPath;
        }
        return {
          // Default to relative paths so the build works in any subdirectory
          // (e.g. GitHub Pages under /repo-name/). User can override with base in vite.config.
          base: cfg.base ?? './',
          build: {
            target: cfg.build?.target ?? 'esnext',
            rollupOptions: {
              ...cfg.build?.rollupOptions,
            },
          },
        };
      }

      // Dev mode — generate editor HTML if no index.html exists
      const indexPath = path.resolve(root, 'index.html');
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, generateEditorHtml(entry));
        generatedIndex = indexPath;
      }
      return {
        build: {
          target: cfg.build?.target ?? 'esnext',
        },
      };
    },

    resolveId(id) {
      if (id === VIRTUAL_BUILD_ENTRY || id === '/' + VIRTUAL_BUILD_ENTRY) {
        return RESOLVED_BUILD_ENTRY;
      }
    },

    load(id) {
      if (id !== RESOLVED_BUILD_ENTRY) return;
      let sceneName = 'main';
      let physicsJson = 'undefined';
      try {
        const settingsPath = path.join(root, 'project-settings.json');
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          if (settings.defaultScene) sceneName = settings.defaultScene;
          if (settings.physics) physicsJson = JSON.stringify(settings.physics);
        }
      } catch { /* use default */ }
      return `
import { startPlayer, createEditorPhysics } from '@certe/atmos-editor/player';
const scriptModules = import.meta.glob('/src/scripts/*.ts', { eager: true });
try {
  const physics = await createEditorPhysics();
  const app = await startPlayer({
    scene: 'scenes/${sceneName}.scene.json',
    physics,
    physicsSettings: ${physicsJson},
    scriptModules,
  });
} catch (err) {
  document.body.style.background = '#111';
  document.body.style.color = '#f88';
  document.body.style.padding = '2em';
  document.body.style.fontFamily = 'monospace';
  document.body.textContent = 'Atmos: ' + (err instanceof Error ? err.message : String(err));
}
`;
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!isBuild) return html;
        // Replace any existing script src with the virtual build entry
        const hasScript = /<script\s+type="module"\s+src="[^"]*"[^>]*><\/script>/.test(html);
        if (hasScript) {
          return html.replace(
            /<script\s+type="module"\s+src="[^"]*"([^>]*)><\/script>/,
            `<script type="module" src="/${VIRTUAL_BUILD_ENTRY}"$1></script>`,
          );
        }
        // No script tag — inject one before </body>
        return html.replace('</body>', `  <script type="module" src="/${VIRTUAL_BUILD_ENTRY}"></script>\n</body>`);
      },
    },

    closeBundle() {
      if (generatedIndex) {
        try { fs.unlinkSync(generatedIndex); } catch { /* ignore */ }
        generatedIndex = '';
      }
    },

    writeBundle(options) {
      if (!isBuild) return;
      const outDir = options.dir || path.resolve(root, 'dist');
      const assetDirs = ['scenes', 'materials', 'textures', 'models'];
      for (const dir of assetDirs) {
        const src = path.resolve(root, dir);
        if (fs.existsSync(src)) {
          copyDirSync(src, path.join(outDir, dir));
        }
      }
      // Copy project-settings.json (physics settings, default scene, etc.)
      const settingsFile = path.resolve(root, 'project-settings.json');
      if (fs.existsSync(settingsFile)) {
        fs.copyFileSync(settingsFile, path.join(outDir, 'project-settings.json'));
      }
    },

    configureServer(server) {
      root = server.config.root;

      // Auto-generate index.html when none exists
      const indexPath = path.resolve(root, 'index.html');
      if (!fs.existsSync(indexPath)) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            const rawHtml = generateEditorHtml(entry);
            server.transformIndexHtml(req.url, rawHtml).then((html) => {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html');
              res.end(html);
            });
            return;
          }
          next();
        });
      }

      // Serve asset tree as JSON
      server.middlewares.use('/__atmos_assets', (_req, res) => {
        const allEntries = [];
        for (const dir of include) {
          const absDir = path.resolve(root, dir);
          if (fs.existsSync(absDir)) {
            allEntries.push(...scanDirectory(absDir, root, exclude));
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ root, entries: allEntries }));
      });

      // ── Project filesystem endpoints ──────────────────

      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/__atmos_fs/')) { next(); return; }

        const url = new URL(req.url, 'http://localhost');
        const action = url.pathname.slice('/__atmos_fs'.length); // e.g. /read, /info
        const filePath = url.searchParams.get('path') ?? '';

        // /info and /tree don't need a file path
        if (action === '/info') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ name: path.basename(root), root }));
          return;
        }
        if (action === '/tree') {
          const allEntries = scanDirectory(root, root, exclude);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(allEntries));
          return;
        }

        // Prevent path traversal for file operations
        const absPath = path.resolve(root, filePath);
        if (!absPath.startsWith(root)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        // Handle async actions (write needs body collection)
        handleFsAction(action, absPath, filePath, root, exclude, req, res, server).catch((err) => {
          res.statusCode = 500;
          res.end(String(err));
        });
      });

      // Watch for file changes and push HMR custom events
      server.watcher.on('all', (event, filePath) => {
        if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
        const relPath = path.relative(root, filePath).replace(/\\/g, '/');
        const inScope = include.some((dir) => relPath.startsWith(dir));
        if (inScope) {
          server.hot.send('atmos:asset-change', { kind: event, path: relPath });
        }
        // Also notify for project files (materials, scenes, etc.)
        if (relPath.startsWith('materials/') || relPath.startsWith('scenes/') || relPath.startsWith('textures/')) {
          server.hot.send('atmos:project-change', { kind: event, path: relPath });
        }
      });
    },
  };
}

async function handleFsAction(action, absPath, filePath, root, exclude, req, res, server) {
  switch (action) {
    case '/read': {
      if (!fs.existsSync(absPath)) { res.statusCode = 404; res.end('Not found'); break; }
      const data = fs.readFileSync(absPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(data);
      break;
    }
    case '/read-text': {
      if (!fs.existsSync(absPath)) { res.statusCode = 404; res.end('Not found'); break; }
      const text = fs.readFileSync(absPath, 'utf-8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(text);
      break;
    }
    case '/write': {
      const body = await collectBody(req);
      const dir = path.dirname(absPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(absPath, body);
      res.end('ok');
      notifyFileChange(server, root, filePath, 'change');
      break;
    }
    case '/delete': {
      fs.unlinkSync(absPath);
      res.end('ok');
      notifyFileChange(server, root, filePath, 'unlink');
      break;
    }
    case '/exists': {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(fs.existsSync(absPath)));
      break;
    }
    case '/mkdir': {
      fs.mkdirSync(absPath, { recursive: true });
      res.end('ok');
      break;
    }
    case '/list': {
      const dir = filePath || '.';
      const absDir = path.resolve(root, dir);
      const files = listRecursive(absDir, filePath ? `${filePath}/` : '');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(files));
      break;
    }
    default:
      res.statusCode = 404;
      res.end('Unknown action');
  }
}

function notifyFileChange(server, root, filePath, kind) {
  // Send HMR event immediately (don't wait for chokidar watcher)
  server.hot.send('atmos:project-change', { kind, path: filePath });
}

function listRecursive(dirPath, prefix) {
  const results = [];
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const full = path.join(dirPath, item.name);
    if (item.isFile()) {
      results.push(prefix + item.name);
    } else if (item.isDirectory()) {
      results.push(...listRecursive(full, `${prefix}${item.name}/`));
    }
  }
  return results.sort();
}

/** @deprecated Use atmosPlugin() instead */
const atmosAssetsPlugin = atmosPlugin;

module.exports = { atmosPlugin, atmosAssetsPlugin };
