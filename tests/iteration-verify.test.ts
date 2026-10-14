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
  const run = vi.fn(async (spec: ProcessSpec) => {
    if (spec.name === 'baseline-tests') {
      const config = await readFile(join(spec.cwd, spec.args.at(-1)!), 'utf8');
      expect(config).toContain('passWithNoTests'); expect(config).toContain('false');
      const prefix = /\.kuade-verification-[a-f0-9-]+/.exec(config)![0];
      expect(await readFile(join(spec.cwd, prefix, 'original.test.ts'), 'utf8')).toBe('expect(original).toBe(true)');
    }
    if (spec.name === 'desktop-build') expect(await readFile(spec.args[0], 'utf8')).toBe('trusted-build');
    if (spec.name === 'package') { await mkdir(join(spec.cwd, 'release/win-unpacked/resources'), { recursive: true }); await writeFile(join(spec.cwd, 'release/win-unpacked/Kuade.exe'), 'built-fixture'); }
    return { name: spec.name, startedAt: 1, finishedAt: 2, exitCode: 0, log: spec.log };
  });
  const artifact = await verifyCandidate(f.snapshot, { node: process.execPath, nativeResources: f.native, evidence: join(f.root, 'evidence'), run });
  expect(artifact.version).toBe('1.0.1');
  expect(run.mock.calls.map(([spec]) => spec.name)).toEqual(['dependencies', 'typecheck', 'baseline-tests', 'desktop-build', 'electron-runtime', 'package']);
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
