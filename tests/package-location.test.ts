// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertIndependentPackageDirectory } from '../src/iteration/package-location';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it('源码旁的产物不借用源码依赖；源码内的产物被拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-package-location-')); roots.push(root);
  await mkdir(join(root, 'source/node_modules'), { recursive: true });
  await mkdir(join(root, 'source/release/win-unpacked'), { recursive: true });
  await mkdir(join(root, 'application/win-unpacked'), { recursive: true });
  await expect(assertIndependentPackageDirectory(join(root, 'application'))).resolves.toBeUndefined();
  await expect(assertIndependentPackageDirectory(join(root, 'source/release/win-unpacked'))).rejects.toThrow('node_modules');
  await mkdir(join(root, 'node_modules'));
  await expect(assertIndependentPackageDirectory(join(root, 'application'))).rejects.toThrow('node_modules');
});
it('校验链接解析后的真实目录，拒绝伪装为独立目录的源码链接', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-package-link-')); roots.push(root);
  await mkdir(join(root, 'source/node_modules'), { recursive: true });
  await mkdir(join(root, 'source/release'), { recursive: true });
  await symlink(join(root, 'source/release'), join(root, 'application'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(assertIndependentPackageDirectory(join(root, 'application'))).rejects.toThrow('node_modules');
});
