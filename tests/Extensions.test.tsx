import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Extensions } from '../src/renderer/features/Extensions';
import { Skills } from '../src/renderer/features/Skills';
afterEach(cleanup);
it('电脑控制区分控件操作、声明的图片能力和能力未知', async () => {
  setup();
  const view = render(<Extensions ready modelName="kimi-k3" modelInput={['text']} onUseSkill={() => {}} />);
  expect(screen.getByText(/当前连接未声明图片输入，将依靠/)).toBeVisible();
  view.rerender(<Extensions ready modelName="vision" modelInput={['text', 'image']} onUseSkill={() => {}} />);
  expect(screen.getByText(/连接已声明支持图片输入，实际截图理解效果以任务验证为准/)).toBeVisible();
  view.rerender(<Extensions ready modelName="loading" onUseSkill={() => {}} />);
  expect(screen.getByText(/是否能理解截图尚未确认/)).toBeVisible();
  await waitFor(() => expect(screen.getByRole('switch', { name: '联网搜索' })).toBeEnabled());
});
it('工具卡直接显示实际注册结果；配置启用但未注册时明确提示', async () => {
  const call = setup({ search: { command: 'uvx' }, playwright: { command: 'npx' } });
  call.mockImplementation(async (endpoint: string) => {
    if (endpoint === 'extensions/read') return { mcpServers: { search: { command: 'uvx' }, playwright: { command: 'npx' } } };
    if (endpoint === 'extensions/skills') return [];
    if (endpoint === 'extensions/status') return { observedAt: 1, servers: [
      { name: 'search', state: 'registered', tools: [{ name: 'mcp__search__search', description: 'Search' }] },
      { name: 'playwright', state: 'unavailable', tools: [] },
    ] };
  });
  render(<Extensions ready onUseSkill={() => {}} />);
  expect(await screen.findByText('可调用 · 1 个工具')).toBeVisible();
  expect(await screen.findByText('未连接成功')).toBeVisible();
  expect(screen.getByRole('switch', { name: '浏览器操作' })).toBeChecked();
});
it('启用期间标明当前工具，其他卡片保留原按钮文字', async () => {
  const call = setup(); let finish!: () => void;
  call.mockImplementation(async (endpoint: string) => {
    if (endpoint === 'extensions/read') return { mcpServers: {} };
    if (endpoint === 'extensions/status') return { observedAt: 1, servers: [] };
    if (endpoint === 'extensions/save') return new Promise<void>(resolve => { finish = resolve; });
  });
  render(<Extensions ready onUseSkill={() => {}} />);
  const toggle = screen.getByRole('switch', { name: '联网搜索' });
  await waitFor(() => expect(toggle).toBeEnabled()); fireEvent.click(toggle);
  expect(await screen.findByText('正在启用联网搜索，引擎会重新连接，请稍候…')).toBeVisible();
  expect(toggle).toHaveTextContent('连接中…');
  expect(screen.getByRole('switch', { name: 'GitHub' })).toHaveTextContent('启用');
  finish(); await waitFor(() => expect(toggle).toBeEnabled());
});
const setup = (servers: any = {}) => {
  const call = vi.fn(async (endpoint: string): Promise<any> => {
    if (endpoint === 'extensions/read') return { mcpServers: servers, preserved: { option: true } };
    if (endpoint === 'extensions/status') return { observedAt: 1, servers: [] };
    if (endpoint === 'extensions/skills') return [];
    if (endpoint === 'extensions/computer') return { command: 'C:/Kuade/qwen.exe', args: ['mcp'] };
    if (endpoint === 'extensions/github') return { command: 'C:/tools/github.exe', args: ['stdio'] };
  });
  Object.defineProperty(window, 'kuade', { value: { call }, configurable: true }); return call;
};
it('常用工具一次点击启用并保存，停用保留配置和额外字段', async () => {
  const call = setup({ playwright: { command: 'custom', args: ['keep'], disabled: true } });
  render(<Extensions ready onUseSkill={() => {}} />);
  const toggle = screen.getByRole('switch', { name: '浏览器操作' });
  await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  expect(call).toHaveBeenCalledWith('extensions/save', { config: { mcpServers: { playwright: { command: 'custom', args: ['keep'], disabled: false } }, preserved: { option: true } } });
  fireEvent.click(toggle); await waitFor(() => expect(toggle).not.toBeChecked());
  expect(call.mock.calls.filter(([endpoint]) => endpoint === 'extensions/save').at(-1)).toEqual(['extensions/save', { config: { mcpServers: { playwright: { command: 'custom', args: ['keep'], disabled: true } }, preserved: { option: true } } }]);
});
it('组件下载失败和保存失败保持原设置，不显示已启用', async () => {
  const call = setup(); render(<Extensions ready onUseSkill={() => {}} />);
  const toggle = screen.getByRole('switch', { name: 'GitHub' }); await waitFor(() => expect(toggle).toBeEnabled());
  call.mockRejectedValueOnce(new Error('组件校验失败')); fireEvent.click(toggle);
  expect(await screen.findByText('组件校验失败')).toBeInTheDocument(); expect(toggle).not.toBeChecked();
  call.mockResolvedValueOnce({ command: 'github', args: [] }).mockRejectedValueOnce(new Error('请先停止任务'));
  fireEvent.click(toggle); expect(await screen.findByText('请先停止任务')).toBeInTheDocument(); expect(toggle).not.toBeChecked();
  expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).not.toContain('github');
});
it('电脑组件通过已有桌面接口解析；保存中的开关禁止再次提交', async () => {
  const call = setup(); render(<Extensions ready onUseSkill={() => {}} />);
  const toggle = screen.getByRole('switch', { name: '电脑控制' }); await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle); fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  expect(call.mock.calls.filter(([name]) => name === 'extensions/save')).toHaveLength(1);
  expect((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value).toContain('C:/Kuade/qwen.exe');
});
it('高级草稿阻止开关静默提交，放弃修改恢复原配置', async () => {
  const call = setup(); render(<Extensions ready onUseSkill={() => {}} />);
  const toggle = screen.getByRole('switch', { name: '联网搜索' }); await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.change(screen.getByLabelText('MCP 配置'), { target: { value: '{bad json' } });
  expect(toggle).toBeDisabled(); expect(call).not.toHaveBeenCalledWith('extensions/save', expect.anything());
  (screen.getByLabelText('MCP 配置').closest('details') as HTMLDetailsElement).open = true;
  fireEvent.click(screen.getByRole('button', { name: '保存并重新加载' }));
  expect(await screen.findByText('配置格式有误，请检查 JSON 后重新保存。')).toBeInTheDocument();
  // The native disclosure is opened by the user in the browser; jsdom needs the attribute for role queries.
  const editor = screen.getByLabelText('MCP 配置').closest('details')!; editor.open = true;
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' })); expect(toggle).toBeEnabled();
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
it('保存后重连失败以重新读取的配置为准，并明确显示连接失败', async () => {
  const call = setup();
  let stored: any = { mcpServers: { playwright: { command: 'custom', args: [], disabled: true } } };
  call.mockImplementation(async (endpoint: string, ...rest: any[]) => {
    if (endpoint === 'extensions/read') return stored;
    if (endpoint === 'extensions/status') return { observedAt: 1, servers: [] };
    if (endpoint === 'extensions/skills') return [];
    if (endpoint === 'extensions/save') { stored = rest[0].config; throw new Error('引擎启动失败'); }
  });
  render(<Extensions ready onUseSkill={() => {}} />);
  const toggle = screen.getByRole('switch', { name: '浏览器操作' });
  await waitFor(() => expect(toggle).toBeEnabled()); fireEvent.click(toggle);
  expect(await screen.findByText('配置已保存，但重新连接未完成：引擎启动失败')).toBeInTheDocument();
  expect(toggle).toBeChecked();
  expect(JSON.parse((screen.getByLabelText('MCP 配置') as HTMLTextAreaElement).value)).toEqual(stored);
  expect(screen.queryByText('高级配置有未保存修改，请先保存或放弃，再切换工具。')).toBeNull();
});
