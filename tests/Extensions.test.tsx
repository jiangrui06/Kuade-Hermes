import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Extensions } from '../src/renderer/features/Extensions';
import { Skills } from '../src/renderer/features/Skills';

afterEach(cleanup);
it('电脑控制由主进程解析随应用提供的组件，读取失败保留原配置', async () => {
  const call = vi.fn(async (endpoint: string): Promise<any> => {
    if (endpoint === 'extensions/read') return { mcpServers: {} };
    if (endpoint === 'extensions/status') return { observedAt: 1, servers: [] };
    if (endpoint === 'extensions/computer') throw new Error('电脑控制组件缺失');
  });
  Object.defineProperty(window, 'kuade', { value: { call }, configurable: true });
  render(<Extensions ready onUseSkill={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '添加电脑控制' }));
  expect(await screen.findByText('电脑控制组件缺失')).toBeInTheDocument();
  expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).not.toContain('qwen_computer');
  call.mockImplementation(async endpoint => endpoint === 'extensions/computer' ? { command: 'C:/Kuade/computer/qwen-computer-use.exe', args: ['--foreground-input', 'mcp'] } : { observedAt: 1, servers: [] });
  fireEvent.click(screen.getByRole('button', { name: '添加电脑控制' }));
  await waitFor(() => expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).toContain('C:/Kuade/computer/qwen-computer-use.exe'));
});
it('展示真实注册状态与技能，并保留已有同名 MCP 配置', async () => {
  const call = vi.fn(async (endpoint: string) => {
    if (endpoint === 'extensions/read') return { mcpServers: { playwright: { command: 'custom', args: ['keep'] } } };
    if (endpoint === 'extensions/status') return { observedAt: 1, servers: [{ name: 'playwright', state: 'unavailable', tools: [] }] };
    if (endpoint === 'extensions/skills') return [{ name: 'project-check', description: '核对项目测试', modelInvocable: true }];
  });
  Object.defineProperty(window, 'kuade', { value: { call }, configurable: true });
  const useSkill = vi.fn();
  render(<Extensions ready workspaceId="project" onUseSkill={useSkill} />);
  expect(await screen.findByText('尚无可用工具')).toBeInTheDocument();
  expect(await screen.findByText('project-check')).toBeInTheDocument();
  await waitFor(() => expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).toContain('custom'));
  fireEvent.click(screen.getByRole('button', { name: '添加浏览器操作' }));
  expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).toContain('custom');
  fireEvent.click(screen.getByRole('button', { name: '添加联网搜索' }));
  expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).toContain('duckduckgo-mcp-server==0.7.0');
  fireEvent.click(screen.getByRole('button', { name: '用于任务' }));
  expect(useSkill).toHaveBeenCalledWith('project-check');
});
it('切换项目后丢弃迟到的技能列表，读取错误不显示为无技能', async () => {
  let finish!: (value: unknown) => void;
  const call = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('离线'));
  Object.defineProperty(window, 'kuade', { value: { call }, configurable: true });
  const view = render(<Skills ready workspaceId="old" onUse={() => {}} />);
  view.rerender(<Skills ready workspaceId="new" onUse={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('离线');
  finish([{ name: 'stale', description: 'stale', modelInvocable: true }]);
  await waitFor(() => expect(screen.queryByText('stale')).toBeNull());
});
