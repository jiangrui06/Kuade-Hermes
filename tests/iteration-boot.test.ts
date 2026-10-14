// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bootHealth } from '../src/main/boot-health';
import { activeVersion } from '../src/main/active-version';
import { executableHash, writeJson } from '../src/iteration/handoff';
import { resourcesHash } from '../src/iteration/artifact';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it('健康回执绑定版本、用户目录、进程与本轮令牌，启动不等于就绪', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-boot-')); roots.push(root);
  const spec = { executable: process.execPath, cwd: root, version: '1.0.1', args: [], sha256: await executableHash(process.execPath) };
  const manifest = { schema: 1, id: randomUUID(), token: randomUUID(), oldPid: process.pid, userData: root, candidateSource: root, previous: spec, candidate: spec };
  const path = join(root, 'updates', manifest.id, 'handoff.json'); await writeJson(path, manifest);
  const args = ['--kuade-handoff=' + path];
  const health = await bootHealth(root, process.execPath, '1.0.1', args);
  const receipt = join(root, 'updates', manifest.id, 'candidate-health.json');
  expect(JSON.parse(await readFile(receipt, 'utf8'))).toMatchObject({ id: manifest.id, token: manifest.token, pid: process.pid, stage: 'starting' });
  await health.ready(); expect(JSON.parse(await readFile(receipt, 'utf8')).stage).toBe('ready');
  await expect(bootHealth(root, process.execPath, '1.0.0', args)).rejects.toThrow('不符');
  await expect(bootHealth(join(root, 'other'), process.execPath, '1.0.1', args)).rejects.toThrow('目录');
});
it('旧入口只跳转到已验证的版本，回退启动跳过跳转，损坏产物保留旧入口', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-active-')); roots.push(root);
  const exe = join(root, 'candidate.exe'); await writeFile(exe, 'candidate');
  const spec = { executable: exe, cwd: root, version: '1.0.1', args: [], sha256: await executableHash(exe) };
  await writeJson(join(root, 'active-version.json'), { status: 'completed', launch: spec });
  expect(await activeVersion(root, process.execPath, [])).toEqual(spec);
  expect(await activeVersion(root, exe, [])).toBeUndefined();
  expect(await activeVersion(root, process.execPath, ['--kuade-handoff=rollback'])).toBeUndefined();
  await writeFile(exe, 'changed'); expect(await activeVersion(root, process.execPath, [])).toBeUndefined();
});
it('资源变化会使版本指纹失效，即便 Electron EXE 保持不变', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-resources-')); roots.push(root);
  const resources = join(root, 'resources'); await mkdir(resources);
  const exe = join(root, 'Kuade.exe'); await writeFile(exe, 'electron');
  await writeFile(join(resources, 'app.asar'), 'verified-code');
  const spec = { executable: exe, cwd: root, version: '1.0.1', args: [], sha256: await executableHash(exe), resourcesSha256: await resourcesHash(resources) };
  await writeJson(join(root, 'active-version.json'), { status: 'completed', launch: spec });
  expect(await activeVersion(root, process.execPath, [])).toEqual(spec);
  await writeFile(join(resources, 'app.asar'), 'different-code');
  expect(await activeVersion(root, process.execPath, [])).toBeUndefined();
});
