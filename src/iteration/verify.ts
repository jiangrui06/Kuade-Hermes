import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { SourceSnapshot, VerificationStep } from '../shared/iteration';
import { BASELINE_FILES, sourceChanges } from './source';
import { buildEnvironment, runStep, type ProcessSpec } from './process';
import { executableHash, writeJson } from './handoff';
import { resourcesHash } from './artifact';
import { assertIndependentPackageDirectory } from './package-location';

export interface VerificationOptions {
  node: string;
  nativeResources: string;
  evidence: string;
  signal?: AbortSignal;
  onStep?(phase: 'testing' | 'building', message: string): Promise<void>;
  run?: (spec: ProcessSpec, signal?: AbortSignal) => Promise<VerificationStep>;
}
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
/** Gate files are copied from the pre-task baseline after the agent has stopped. */
export async function verifyCandidate(snapshot: SourceSnapshot, options: VerificationOptions) {
  const { candidate, baseline } = snapshot;
  const changes = await sourceChanges(snapshot);
  if (!changes.some(file => /^(src|tests|docs|vendor)\//.test(file.path))) throw new Error('模型没有产生功能、测试或文档变更，本轮不更新');
  const pkg = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
  if (pkg.name !== 'kuade-desktop' || pkg.main !== 'dist/main/index.js' || pkg.version !== snapshot.targetVersion) throw new Error('候选版本身份发生变动，请检查 package.json');
  for (const file of snapshot.files.filter(file => file.path.startsWith('tests/') || BASELINE_FILES.includes(file.path))) {
    if (sha256(await readFile(join(baseline, file.path))) !== file.sha256) throw new Error('基线验证文件发生变动，本轮停止：' + file.path);
  }
  await mkdir(options.evidence, { recursive: true });
  // Keep the artifact beside source/, never underneath its node_modules ancestry.
  const output = join(dirname(candidate), 'application');
  await mkdir(output, { recursive: true });
  await assertIndependentPackageDirectory(output);
  await writeJson(join(options.evidence, 'changes.json'), changes);
  const receipts: VerificationStep[] = [];
  const run = options.run ?? runStep;
  const execute = async (spec: Omit<ProcessSpec, 'cwd' | 'log'>) => {
    options.signal?.throwIfAborted();
    const receipt = await run({ ...spec, cwd: candidate, log: join(options.evidence, String(receipts.length + 1).padStart(2, '0') + '-' + spec.name + '.log') }, options.signal);
    receipts.push(receipt); await writeJson(join(options.evidence, 'verification.json'), receipts);
  };
  const node = async (name: string, args: string[]) => execute({ name, executable: options.node, args, env: buildEnvironment(process.env) });
  await options.onStep?.('testing', '安装锁定依赖并验证原始测试');
  await execute({ name: 'dependencies', executable: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'] });
  const prefix = '.kuade-verification-' + randomUUID();
  const checks = join(candidate, prefix); await cp(join(baseline, 'tests'), checks, { recursive: true, errorOnExist: true, force: false });
  const baselineTs = JSON.parse(await readFile(join(baseline, 'tsconfig.json'), 'utf8'));
  const tsconfig = prefix + '.json';
  await writeFile(join(candidate, tsconfig), JSON.stringify({ ...baselineTs, include: ['src', prefix, 'tests'], exclude: ['node_modules', 'release', 'dist'] }));
  await node('typecheck', [join(candidate, 'node_modules/typescript/bin/tsc'), '--noEmit', '--project', tsconfig]);
  const vitest = prefix + '.config.mjs';
  const include = [`${prefix}/**/*.test.{ts,tsx}`, ...changes.filter(file => file.change !== 'deleted' && /^tests\/.*\.test\.(ts|tsx)$/.test(file.path)).map(file => file.path)];
  await writeFile(join(candidate, vitest), `import {defineConfig} from 'vitest/config';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],test:${JSON.stringify({ include, environment: 'jsdom', setupFiles: [prefix + '/setup.ts'], passWithNoTests: false })}});`);
  await node('baseline-tests', [join(candidate, 'node_modules/vitest/vitest.mjs'), 'run', '--config', vitest]);
  await options.onStep?.('building', '生成并验证新的桌面版本');
  // Reuse a shipped native component only when its exact recorded source matches.
  let reuseNative = false;
  try {
    const provenance = JSON.parse(await readFile(join(options.nativeResources, 'provenance.json'), 'utf8'));
    const sources = snapshot.files.filter(file => file.path.startsWith('vendor/qwen-computer-use/'));
    reuseNative = Array.isArray(provenance.sources) && provenance.sources.length === sources.length && sources.every(file => provenance.sources.some((entry: any) => entry.path === file.path && entry.sha256 === file.sha256))
      && !changes.some(file => file.path.startsWith('vendor/qwen-computer-use/'))
      && provenance.sha256 === await executableHash(join(options.nativeResources, 'qwen-computer-use.exe'));
  } catch { /* A missing or unmatched provenance requires rebuilding from source. */ }
  if (reuseNative) await cp(options.nativeResources, join(candidate, 'resources/computer'), { recursive: true });
  else {
    const buildComputer = join(candidate, prefix + '-computer.mjs'); await cp(join(baseline, 'scripts/build-computer.mjs'), buildComputer);
    await node('computer-build', [buildComputer]);
  }
  const build = join(candidate, prefix + '-build.mjs'); await cp(join(baseline, 'scripts/build.mjs'), build);
  await node('desktop-build', [build]);
  // Electron 44 installs its binary on demand, separately from npm ci.
  await node('electron-runtime', [join(candidate, 'node_modules/electron/install.js')]);
  const config = relative(candidate, join(baseline, 'electron-builder.yml'));
  // The official installer verifies the pinned distribution. Use builder's
  // supported electronDist option instead of downloading the same runtime again.
  const installerConfig = snapshot.files.some(file => file.path === 'scripts/installer.nsh')
    ? ['--config.nsis.include=' + join(baseline, 'scripts/installer.nsh')] : [];
  await node('package', [join(candidate, 'node_modules/electron-builder/out/cli/cli.js'), '--win', '--x64', '--dir', '--publish', 'never', '--config', config, ...installerConfig, '--config.electronDist=node_modules/electron/dist', '--config.directories.output=' + output]);
  const executable = join(output, 'win-unpacked/Kuade.exe');
  await options.onStep?.('building', '在独立用户目录验证候选界面与引擎启动');
  const smoke = join(candidate, prefix + '-startup.mjs');
  await cp(join(baseline, 'scripts/check-packaged-startup.mjs'), smoke);
  await node('packaged-startup', [smoke, executable, snapshot.targetVersion, options.evidence]);
  const artifact = { executable, version: snapshot.targetVersion, sha256: await executableHash(executable), resourcesSha256: await resourcesHash(join(output, 'win-unpacked/resources')), changes, steps: receipts };
  await writeJson(join(options.evidence, 'artifact.json'), artifact);
  return artifact;
}
