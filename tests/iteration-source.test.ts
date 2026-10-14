// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSource, sourceChanges, nextIterationVersion } from '../src/iteration/source';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kuade-iteration-')); roots.push(root);
  const source = join(root, 'original'); await mkdir(join(source, 'src/main'), { recursive: true });
  await writeFile(join(source, 'src/main/index.ts'), 'export const version = 1;');
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'kuade-desktop', main: 'dist/main/index.js', version: '0.1.5' }));
  await writeFile(join(source, 'package-lock.json'), JSON.stringify({ version: '0.1.5', packages: { '': { version: '0.1.5' } } }));
  await mkdir(join(source, 'tests')); await writeFile(join(source, 'tests/original.test.ts'), 'original test');
  return { root, source, run: join(root, 'run') };
}
it('源码副本独立、保留基线测试与版本记录，不带用户环境和构建产物', async () => {
  const f = await fixture(); await writeFile(join(f.source, '.env'), 'PRIVATE_KEY=secret');
  await mkdir(join(f.source, 'src/.cache')); await writeFile(join(f.source, 'src/.cache/private'), 'secret');
  const snapshot = await prepareSource(f.source, f.run);
  expect(snapshot.targetVersion).toBe('0.1.6');
  expect(snapshot.files.some(file => file.path.includes('.env') || file.path.includes('.cache'))).toBe(false);
  expect(JSON.parse(await readFile(join(f.source, 'package.json'), 'utf8')).version).toBe('0.1.5');
  expect(await readFile(join(snapshot.baseline, 'tests/original.test.ts'), 'utf8')).toBe('original test');
  await writeFile(join(snapshot.candidate, 'src/main/index.ts'), 'modified feature');
  await writeFile(join(snapshot.candidate, 'src/new.ts'), 'new feature');
  await rm(join(snapshot.candidate, 'tests/original.test.ts'));
  expect(await sourceChanges(snapshot)).toEqual(expect.arrayContaining([{ path: 'src/main/index.ts', change: 'modified' }, { path: 'src/new.ts', change: 'added' }, { path: 'tests/original.test.ts', change: 'deleted' }]));
  expect(await readFile(join(f.source, 'src/main/index.ts'), 'utf8')).toBe('export const version = 1;');
  await expect(prepareSource(f.source, f.run)).rejects.toThrow();
});
it('拒绝源码目录嵌套、错误项目及可逃逸的目录链接', async () => {
  const f = await fixture();
  await expect(prepareSource(f.source, join(f.source, '.kuade/run'))).rejects.toThrow('分开');
  await mkdir(join(f.root, 'outside')); await symlink(join(f.root, 'outside'), join(f.source, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(prepareSource(f.source, f.run)).rejects.toThrow('链接');
  expect(nextIterationVersion('2.4.9-preview.1')).toBe('2.4.10');
  expect(() => nextIterationVersion('invalid')).toThrow();
});
