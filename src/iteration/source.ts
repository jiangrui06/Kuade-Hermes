import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { SourceEntry, SourceSnapshot } from '../shared/iteration';

const ROOTS = ['src', 'assets', 'scripts', 'tests', 'docs', 'vendor', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'electron-builder.yml', 'README.md', 'THIRD_PARTY_NOTICES.md'];
const EXCLUDED = new Set(['node_modules', '.git', '.cache', '.kuade', 'release', 'dist', 'coverage', 'test-results', 'playwright-report']);
export const BASELINE_FILES = ['scripts/build.mjs', 'scripts/build-computer.mjs', 'scripts/check-packaged-startup.mjs', 'scripts/installer.nsh', 'tsconfig.json', 'electron-builder.yml'];
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export function isWithin(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith('..' + sep));
}
export function nextIterationVersion(version: string): string {
  const parts = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!parts) throw new Error('源码版本需要符合 major.minor.patch 格式');
  return `${parts[1]}.${parts[2]}.${Number(parts[3]) + 1}`;
}
async function inventory(root: string): Promise<SourceEntry[]> {
  const files: SourceEntry[] = [];
  const walk = async (path: string) => {
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`源码含链接，请先移除或转换为实际文件：${path}`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort()) {
        if (EXCLUDED.has(name) || name === '.env' || name.startsWith('.env.') || /^\.?credentials\.(json|ya?ml)$/i.test(name)) continue;
        await walk(join(path, name));
      }
    } else if (stat.isFile()) files.push({ path: path.split(sep).join('/'), sha256: hash(await readFile(join(root, path))) });
  };
  for (const entry of ROOTS) {
    try { await lstat(join(root, entry)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    await walk(entry);
  }
  return files;
}
/** Explicit product source roots exclude the user's runtime home and build artifacts. */
export async function prepareSource(sourcePath: string, runRoot: string): Promise<SourceSnapshot> {
  const source = await realpath(sourcePath);
  if (isWithin(source, runRoot) || isWithin(runRoot, source)) throw new Error('迭代目录与原始源码需要分开存放');
  await mkdir(runRoot, { recursive: true });
  const run = await realpath(runRoot);
  if (isWithin(source, run) || isWithin(run, source)) throw new Error('迭代目录与原始源码需要分开存放');
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  if (pkg.name !== 'kuade-desktop' || pkg.main !== 'dist/main/index.js') throw new Error('请选择 Kuade Harness 的源码目录');
  const candidate = join(run, 'source'); const baseline = join(run, 'baseline');
  // Fail on reuse instead of merging with an earlier iteration's files.
  await mkdir(candidate); await mkdir(baseline);
  const files = await inventory(source);
  if (!files.some(file => file.path === 'src/main/index.ts') || !files.some(file => file.path === 'package-lock.json')) throw new Error('Kuade 源码缺少入口或依赖锁文件');
  for (const file of files) {
    const target = join(candidate, file.path); await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, file.path), target);
    if (hash(await readFile(target)) !== file.sha256) throw new Error('复制期间源码发生变动，请重新开始本轮迭代');
    if (file.path.startsWith('tests/') || BASELINE_FILES.includes(file.path)) {
      const saved = join(baseline, file.path); await mkdir(dirname(saved), { recursive: true }); await copyFile(target, saved);
    }
  }
  if (JSON.stringify(files) !== JSON.stringify(await inventory(source))) throw new Error('复制期间源码发生变动，请重新开始本轮迭代');
  const targetVersion = nextIterationVersion(pkg.version);
  await writeFile(join(candidate, 'package.json'), JSON.stringify({ ...pkg, version: targetVersion }, null, 2) + '\n');
  const lock = JSON.parse(await readFile(join(candidate, 'package-lock.json'), 'utf8'));
  lock.version = targetVersion;
  if (lock.packages?.['']) lock.packages[''].version = targetVersion;
  await writeFile(join(candidate, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  const snapshot: SourceSnapshot = { source, candidate, baseline, baseVersion: pkg.version, targetVersion, files };
  await writeFile(join(run, 'source-manifest.json'), JSON.stringify(snapshot, null, 2));
  return snapshot;
}
export async function sourceChanges(snapshot: SourceSnapshot): Promise<{ path: string; change: 'added' | 'modified' | 'deleted' }[]> {
  const previous = new Map(snapshot.files.map(file => [file.path, file.sha256]));
  const current = new Map((await inventory(snapshot.candidate)).map(file => [file.path, file.sha256]));
  return [...new Set([...previous.keys(), ...current.keys()])].sort().flatMap(path => {
    if (previous.get(path) === current.get(path)) return [];
    return [{ path, change: !previous.has(path) ? 'added' as const : !current.has(path) ? 'deleted' as const : 'modified' as const }];
  });
}
