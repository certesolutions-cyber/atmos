import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { atmosPlugin } from '@certe/atmos-editor/vite';

export default defineConfig({
  root: __dirname,
  plugins: [react(), atmosPlugin()],
  server: { open: true, port: 5172 },
});
