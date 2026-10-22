// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('锁定必需生产 peer 为显式依赖，避免发行包借用源码目录的模块', async () => {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const omitted = Object.entries(lock.packages).filter(([, entry]: [string, any]) => entry.peer && !entry.dev && !entry.optional).map(([path]) => path);
  // The pinned electron-builder collector omits auto-installed peer-only entries.
  // This failed for the original lockfile's 27 required Harness peers.
  expect(omitted, 'Required runtime peers must be explicit production dependencies before packaging').toEqual([]);
});
