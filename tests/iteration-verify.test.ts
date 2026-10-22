// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareSource } from '../src/iteration/source';
import { verifyCandidate } from '../src/iteration/verify';
import { executableHash } from '../src/iteration/handoff';
import type { ProcessSpec } from '../src/iteration/process';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'kuade-verify-')); roots.push(root);
  const source = join(root, 'original');
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'kuade-desktop', main: 'dist/main/index.js', version: '1.0.0' }),
    'package-lock.json': '{}', 'src/main/index.ts': 'original', 'tests/original.test.ts': 'expect(original).toBe(true)',
    'tests/setup.ts': 'setup', 'scripts/build.mjs': 'trusted-build', 'scripts/build-computer.mjs': 'trusted-native-build',
    'scripts/check-packaged-startup.mjs': 'trusted-startup',
    'scripts/installer.nsh': 'trusted-installer',
    'tsconfig.json': '{}', 'electron-builder.yml': 'original-packaging',
  };
  for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(source, path)), { recursive: true }); await writeFile(join(source, path), content); }
  const snapshot = await prepareSource(source, join(root, 'run'));
  await writeFile(join(snapshot.candidate, 'src/main/index.ts'), 'improved');
  const native = join(root, 'native'); await mkdir(native);
  await writeFile(join(native, 'qwen-computer-use.exe'), 'native-fixture');
  await writeFile(join(native, 'provenance.json'), JSON.stringify({ sources: [], sha256: await executableHash(join(native, 'qwen-computer-use.exe')) }));
  return { root, snapshot, native };
}
it('候选删除测试或改构建脚本，仍执行原始测试和独立构建门槛', async () => {
  const f = await setup();
  await rm(join(f.snapshot.candidate, 'tests/original.test.ts'));
  await writeFile(join(f.snapshot.candidate, 'scripts/build.mjs'), 'skip-all-checks');
  await writeFile(join(f.snapshot.candidate, 'scripts/check-packaged-startup.mjs'), 'skip-startup');
  await writeFile(join(f.snapshot.candidate, 'scripts/installer.nsh'), 'terminate-unrelated-process');
  const run = vi.fn(async (spec: ProcessSpec) => {
    if (spec.name === 'baseline-tests') {
      const config = await readFile(join(spec.cwd, spec.args.at(-1)!), 'utf8');
      expect(config).toContain('passWithNoTests'); expect(config).toContain('false');
      const prefix = /\.kuade-verification-[a-f0-9-]+/.exec(config)![0];
      expect(await readFile(join(spec.cwd, prefix, 'original.test.ts'), 'utf8')).toBe('expect(original).toBe(true)');
    }
    if (spec.name === 'desktop-build') expect(await readFile(spec.args[0], 'utf8')).toBe('trusted-build');
    if (spec.name === 'package') {
      const include = '--config.nsis.include=' + join(f.snapshot.baseline, 'scripts/installer.nsh');
      expect(spec.args).toContain(include);
      expect(await readFile(include.slice('--config.nsis.include='.length), 'utf8')).toBe('trusted-installer');
      const output = join(dirname(spec.cwd), 'application');
      expect(spec.args).toContain('--config.directories.output=' + output);
      await mkdir(join(output, 'win-unpacked/resources'), { recursive: true }); await writeFile(join(output, 'win-unpacked/Kuade.exe'), 'built-fixture');
    }
    if (spec.name === 'packaged-startup') {
      expect(await readFile(spec.args[0], 'utf8')).toBe('trusted-startup');
      expect(spec.args.slice(1)).toEqual([join(f.root, 'run/application/win-unpacked/Kuade.exe'), '1.0.1', join(f.root, 'evidence')]);
    }
    return { name: spec.name, startedAt: 1, finishedAt: 2, exitCode: 0, log: spec.log };
  });
  const artifact = await verifyCandidate(f.snapshot, { node: process.execPath, nativeResources: f.native, evidence: join(f.root, 'evidence'), run });
  expect(artifact.version).toBe('1.0.1');
  expect(artifact.executable).toBe(join(f.root, 'run/application/win-unpacked/Kuade.exe'));
  expect(run.mock.calls.map(([spec]) => spec.name)).toEqual(['dependencies', 'typecheck', 'baseline-tests', 'desktop-build', 'electron-runtime', 'package', 'packaged-startup']);
});
it('安装器保护基线被修改时，在运行任何构建命令前拒绝验证', async () => {
  const f = await setup(); const run = vi.fn();
  await writeFile(join(f.snapshot.baseline, 'scripts/installer.nsh'), 'tampered');
  await expect(verifyCandidate(f.snapshot, { node: process.execPath, nativeResources: f.native, evidence: join(f.root, 'evidence'), run })).rejects.toThrow('scripts/installer.nsh');
  expect(run).not.toHaveBeenCalled();
});
it('独立启动失败时拒绝产物；启动脚本的基线被修改也拒绝验证', async () => {
  const f = await setup();
  const run = vi.fn(async (spec: ProcessSpec) => {
    if (spec.name === 'packaged-startup') throw new Error('missing packaged dependency');
    return { name: spec.name, startedAt: 1, finishedAt: 2, exitCode: 0, log: spec.log };
  });
  const options = { node: process.execPath, nativeResources: f.native, evidence: join(f.root, 'evidence'), run };
  await expect(verifyCandidate(f.snapshot, options)).rejects.toThrow('missing packaged dependency');
  await expect(readFile(join(f.root, 'evidence/artifact.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(join(f.snapshot.baseline, 'scripts/check-packaged-startup.mjs'), 'modified baseline');
  run.mockClear();
  await expect(verifyCandidate(f.snapshot, options)).rejects.toThrow('基线');
  expect(run).not.toHaveBeenCalled();
});
it('原始测试副本被改动或验证命令失败时不产生可更新产物', async () => {
  const f = await setup(); const run = vi.fn().mockRejectedValue(new Error('actual failing command'));
  const options = { node: process.execPath, nativeResources: f.native, evidence: join(f.root, 'evidence'), run };
  await expect(verifyCandidate(f.snapshot, options)).rejects.toThrow('actual failing command');
  expect(run).toHaveBeenCalledTimes(1);
  await writeFile(join(f.snapshot.baseline, 'tests/original.test.ts'), 'weakened');
  run.mockClear();
  await expect(verifyCandidate(f.snapshot, options)).rejects.toThrow('基线');
  expect(run).not.toHaveBeenCalled();
});
