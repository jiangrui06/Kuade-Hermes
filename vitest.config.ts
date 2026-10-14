import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
export default defineConfig({
  root: realpathSync.native(process.cwd()),
  plugins: [react()],
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['tests/setup.ts'] },
});
