import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  publicDir: resolve('assets'),
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
});
