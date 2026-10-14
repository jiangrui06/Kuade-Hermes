import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', workers: 1, timeout: 180000, expect: { timeout: 30000 }, reporter: [['list']], outputDir: 'test-results' });
