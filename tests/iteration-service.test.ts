// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, statfs, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IterationService } from '../src/iteration/service';
import { writeJson } from '../src/iteration/handoff';
import { verifyCandidate } from '../src/iteration/verify';
vi.mock('../src/iteration/verify', () => ({ verifyCandidate: vi.fn().mockRejectedValue(new Error('verification failed')) }));
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(), statfs: vi.fn() }));
beforeEach(() => { vi.mocked(statfs).mockResolvedValue({ bavail: 8 * 1024 ** 3, bsize: 1 } as Awaited<ReturnType<typeof statfs>>); });
const roots: string[] = [];
const services: IterationService[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.cancel(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); vi.clearAllMocks(); });
async function setup(reason = 'completed', version = '1.0.0') {
  const root = await mkdtemp(join(tmpdir(), 'kuade-service-')); roots.push(root);
  const source = join(root, 'original'); await mkdir(join(source, 'src/main'), { recursive: true });
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'kuade-desktop', main: 'dist/main/index.js', version }));
  await writeFile(join(source, 'package-lock.json'), '{}'); await writeFile(join(source, 'src/main/index.ts'), 'original');
  const call = vi.fn(async (endpoint: string): Promise<any> => {
    if (endpoint === 'workspace/create') return { workspace: { workspaceId: 'workspace' } };
    if (endpoint === 'session/create') return { sessionId: 'task' };
    if (endpoint === 'session/list') return { items: [{ sessionId: 'task', running: false, blank: false }] };
    if (endpoint === 'session/projections') return { asOfSeq: 5, values: { todos: [] } };
    if (endpoint === 'session/page') return { records: [{ event: { type: 'turn/end', seq: 5, data: { reason: { kind: reason } } } }] };
  });
  const options = { userData: join(root, 'profile'), buildRoot: join(root, 'runs'), executable: process.execPath, appRoot: root, version: '1.0.0', packaged: false, nativeResources: root, watchdog: '', call, prepareModel: vi.fn().mockResolvedValue({ reasoning: { efforts: [{ id: 'high' }] } }), quit: vi.fn() };
  const service = new IterationService(options); services.push(service);
  return { service, call, options, input: { source, requirement: '改进一个功能', provider: 'fixture', model: 'fixture', effort: 'high' } };
}
it('Agent 完成后必须通过宿主验证，验证失败不退出旧程序', async () => {
  const f = await setup();
  await f.service.start(f.input);
  await expect.poll(async () => (await f.service.status())?.phase, { timeout: 5000 }).toBe('failed');
  expect((await f.service.status())?.message).toBe('verification failed');
  expect(verifyCandidate).toHaveBeenCalledTimes(1); expect(f.options.quit).not.toHaveBeenCalled();
  expect(verifyCandidate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ node: 'node' }));
  expect(f.call).toHaveBeenCalledWith('session/selectModel', { request: { sessionId: 'task', provider: 'fixture', model: 'fixture', reasoningEffort: 'high' } });
});
it('行动上限与版本不匹配保留为待处理状态，不进入构建', async () => {
  for (const [reason, version] of [['max-steps', '1.0.0'], ['completed', '0.9.0']]) {
    const f = await setup(reason, version); await f.service.start(f.input);
    await expect.poll(async () => (await f.service.status())?.phase, { timeout: 5000 }).toBe('failed');
    expect((await f.service.status())?.message).toContain(reason === 'max-steps' ? 'max-steps' : '不一致');
    expect(f.options.quit).not.toHaveBeenCalled();
  }
  expect(verifyCandidate).not.toHaveBeenCalled();
});
it('并发启动只有一次被接受，停止会取消当前任务并保留候选源码', async () => {
  const f = await setup();
  f.call.mockImplementation(async endpoint => {
    if (endpoint === 'workspace/create') return { workspace: { workspaceId: 'workspace' } };
    if (endpoint === 'session/create') return { sessionId: 'task' };
    if (endpoint === 'session/list') return { items: [{ sessionId: 'task', running: true }] };
  });
  const starting = f.service.start(f.input);
  await expect(f.service.start(f.input)).rejects.toThrow('正在准备'); await starting;
  await expect.poll(async () => (await f.service.status())?.phase, { timeout: 5000 }).toBe('coding');
  const cancelled = await f.service.cancel(); expect(cancelled?.phase).toBe('cancelled');
  expect(cancelled?.candidate).toContain('source');
  expect(f.call).toHaveBeenCalledWith('session/cancel', { request: { sessionId: 'task' } });
  expect(verifyCandidate).not.toHaveBeenCalled();
});
it('进程重启后中断的验证保留为待处理，结果文件只恢复本轮切换状态', async () => {
  const f = await setup();
  const state = { id: 'current', phase: 'building', message: 'building' };
  await writeJson(join(f.options.userData, 'iteration.json'), { state, input: f.input, afterSeq: -1 });
  expect((await f.service.status())?.phase).toBe('failed');
  await writeJson(join(f.options.userData, 'iteration.json'), { state: { ...state, phase: 'restarting' }, input: f.input, afterSeq: -1 });
  const next = new IterationService(f.options);
  await writeJson(join(f.options.userData, 'updates/current/result.json'), { id: 'other', status: 'completed' });
  expect((await next.status())?.phase).toBe('restarting');
  await writeJson(join(f.options.userData, 'updates/current/result.json'), { id: 'current', status: 'rolled-back', reason: 'candidate failed' });
  expect(await next.status()).toMatchObject({ phase: 'rolled-back', message: 'candidate failed' });
});
it('已切换到的版本禁止原地重建，需要创建下一轮副本', async () => {
  const f = await setup();
  await writeJson(join(f.options.userData, 'iteration.json'), { state: { id: 'current', phase: 'completed' }, input: f.input, afterSeq: -1 });
  await expect(f.service.retry()).rejects.toThrow('开始新一轮');
  expect(verifyCandidate).not.toHaveBeenCalled(); expect(f.options.quit).not.toHaveBeenCalled();
});
it('空间不足时不建立 Agent 任务或进入构建', async () => {
  const f = await setup();
  vi.mocked(statfs).mockResolvedValue({ bavail: 1024, bsize: 1 } as Awaited<ReturnType<typeof statfs>>);
  await expect(f.service.start(f.input)).rejects.toThrow('不足 3 GiB');
  expect(f.call).not.toHaveBeenCalled(); expect(verifyCandidate).not.toHaveBeenCalled();
});
