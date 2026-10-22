import { defineConfig } from '@playwright/test';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

// A package under a source checkout can silently resolve missing runtime peers
// from its ancestors. Require a standalone location for packaged acceptance.
if (process.env.KUADE_TEST_EXECUTABLE) {
  let directory = dirname(realpathSync(process.env.KUADE_TEST_EXECUTABLE));
  for (;;) {
    if (existsSync(join(directory, 'node_modules'))) throw new Error('Packaged acceptance requires an independent directory without ancestor node_modules: ' + directory);
    const parent = dirname(directory); if (parent === directory) break;
    directory = parent;
  }
}
export default defineConfig({ testDir: './tests/e2e', workers: 1, timeout: 180000, expect: { timeout: 30000 }, reporter: [['list']], outputDir: 'test-results' });
