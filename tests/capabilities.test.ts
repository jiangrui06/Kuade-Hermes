// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { capabilityReport, CapabilitiesService } from '../src/runtime/capabilities-service';

it('配置存在不等于工具可用；按完整服务器命名空间匹配真实注册工具和结果', () => {
  const report = capabilityReport({ mcpServers: { demo: { command: 'fixture', args: [] }, demo2: { command: 'fixture', args: [] }, off: { command: 'fixture', args: [], disabled: true } } }, {
    observedAt: 20, tools: [{ name: 'mcp__demo__echo', description: 'echo' }, { name: 'mcp__off__echo', description: 'stale' }],
    calls: [{ name: 'mcp__demo__echo', at: 3, outcome: 'succeeded' }, { name: 'mcp__demo__echo', at: 5, outcome: 'failed' }],
  });
  expect(report.servers[0]).toMatchObject({ state: 'registered', lastCall: { outcome: 'failed', at: 5 } });
  expect(report.servers[1]).toMatchObject({ state: 'unavailable', tools: [] });
  expect(report.servers[2].state).toBe('disabled');
  expect(() => capabilityReport({ mcpServers: {} }, { tools: 'invalid' })).toThrow();
});
it('技能复用上游项目预设，只创建一次空白上下文并透传真实发现结果', async () => {
  const call = vi.fn(async (endpoint: string) => endpoint === 'session/create' ? { sessionId: 'probe' } : { skills: [{ name: 'fixture-skill', description: '中文技能', modelInvocable: true }] });
  const service = new CapabilitiesService(call, async () => ({ mcpServers: {} }));
  const [first, second] = await Promise.all([service.skills('workspace'), service.skills('workspace')]);
  expect(first).toEqual(second); expect(first[0].name).toBe('fixture-skill');
  expect(call.mock.calls.filter(([endpoint]) => endpoint === 'session/create')).toHaveLength(1);
  expect(call).toHaveBeenCalledWith('skills/list', { request: { sessionId: 'probe' } });
  await service.skills('workspace', 'existing');
  expect(call).toHaveBeenLastCalledWith('skills/list', { request: { sessionId: 'existing' } });
});
it('创建上下文失败后可重试，未将失败缓存为技能空列表', async () => {
  const call = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ sessionId: 'recovered' }).mockResolvedValue({ skills: [] });
  const service = new CapabilitiesService(call, async () => ({ mcpServers: {} }));
  await expect(service.skills('workspace')).rejects.toThrow('offline');
  await expect(service.skills('workspace')).resolves.toEqual([]);
});
