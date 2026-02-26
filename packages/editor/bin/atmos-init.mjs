#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

console.log('Initializing Atmos project...\n');

// 1. Ensure package.json exists
if (!fs.existsSync(path.join(root, 'package.json'))) {
  console.log('Creating package.json...');
  execSync('npm init -y', { stdio: 'inherit', cwd: root });
}

// Ensure "type": "module" in package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
if (pkg.type !== 'module') {
  pkg.type = 'module';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('Set "type": "module" in package.json');
}

// 2. vite.config.ts
const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { atmosPlugin } from '@certe/atmos-editor/vite';

export default defineConfig({
  plugins: [react(), atmosPlugin()],
});
`;

if (!fs.existsSync(path.join(root, 'vite.config.ts'))) {
  fs.writeFileSync(path.join(root, 'vite.config.ts'), viteConfig);
  console.log('Created vite.config.ts');
} else {
  console.log('vite.config.ts already exists, skipping');
}

// 3. src/main.ts
const mainTs = `import { startEditor, createEditorPhysics } from '@certe/atmos-editor';

await startEditor({
  physics: await createEditorPhysics(),
  scriptModules: import.meta.glob('./scripts/*.ts', { eager: true }),
});
`;

fs.mkdirSync(path.join(root, 'src', 'scripts'), { recursive: true });

if (!fs.existsSync(path.join(root, 'src', 'main.ts'))) {
  fs.writeFileSync(path.join(root, 'src', 'main.ts'), mainTs);
  console.log('Created src/main.ts');
} else {
  console.log('src/main.ts already exists, skipping');
}

// 4. tsconfig.json
const tsconfig = {
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    types: ['vite/client'],
  },
  include: ['src'],
};

if (!fs.existsSync(path.join(root, 'tsconfig.json'))) {
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  console.log('Created tsconfig.json');
} else {
  console.log('tsconfig.json already exists, skipping');
}

// 5. Install dev dependencies
console.log('\nInstalling dependencies...');
execSync('npm install -D vite @vitejs/plugin-react typescript', { stdio: 'inherit', cwd: root });

// 6. Add scripts to package.json if missing
const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
updatedPkg.scripts = updatedPkg.scripts || {};
if (!updatedPkg.scripts.dev) updatedPkg.scripts.dev = 'vite';
if (!updatedPkg.scripts.build) updatedPkg.scripts.build = 'vite build';
if (!updatedPkg.scripts.preview) updatedPkg.scripts.preview = 'vite preview';
fs.writeFileSync(pkgPath, JSON.stringify(updatedPkg, null, 2) + '\n');

console.log('\nDone! Run "npm run dev" to start the editor.');
