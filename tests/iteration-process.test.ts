// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEnvironment, runStep } from '../src/iteration/process';

it('执行器依据真实退出码验收，并记录失败和停止，清除继承的服务凭据', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-process-'));
  const spec = { name: 'fixture', executable: process.execPath, cwd: root, log: join(root, 'run.log'), env: { ...buildEnvironment(process.env), ELECTRON_RUN_AS_NODE: '1' }, timeoutMs: 5000, args: ['-e', "console.log('verified')"] };
  try {
    expect((await runStep(spec)).exitCode).toBe(0);
    expect(await readFile(spec.log, 'utf8')).toContain('verified');
    await expect(runStep({ ...spec, args: ['-e', 'process.exit(7)'] })).rejects.toMatchObject({ receipt: { exitCode: 7 } });
    const abort = new AbortController();
    const pending = runStep({ ...spec, args: ['-e', 'setInterval(() => {}, 1000)'] }, abort.signal);
    setTimeout(() => abort.abort(), 300);
    await expect(pending).rejects.toThrow('已停止');
    expect(buildEnvironment({ PATH: 'keep-original', OPENAI_API_KEY: 'secret', KUADE_USER_DATA: 'profile', ELECTRON_RUN_AS_NODE: '1' })).toEqual({ PATH: 'keep-original' });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
