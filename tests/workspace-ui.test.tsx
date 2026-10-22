import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Welcome } from '../src/renderer/components/Welcome';
import { Timeline } from '../src/renderer/components/Timeline';
import { emptyView } from '../src/renderer/features/session-model';
import { outputBlocks, toolPresentation } from '../src/renderer/features/output-presentation';
import { skillPrompt, toolPrompt } from '../src/renderer/features/capability-prompts';

afterEach(cleanup);
it('选择技能和工具示例保留未发送需求，重复选择不叠加相同内容', () => {
  const draft = '保留这个需求，不要删除';
  const skill = skillPrompt('acceptance-workflow', draft);
  expect(skill).toContain(draft); expect(skill).toContain('acceptance-workflow');
  expect(skillPrompt('acceptance-workflow', skill)).toBe(skill);
  const tool = toolPrompt('search', draft); expect(tool).toContain(draft);
  expect(toolPrompt('search', tool)).toBe(tool);
  expect(toolPrompt('qwen_computer', '')).toContain('先只观察');
});
it('已知 MCP 操作用中文描述，未知扩展保留可辨识的服务和工具名称', () => {
  const item = { id: 1, role: 'tool' as const, time: 1, text: '{}' };
  expect(toolPresentation({ ...item, title: 'mcp__search__search' }).label).toBe('联网搜索 · 搜索互联网');
  expect(toolPresentation({ ...item, title: 'mcp__qwen_computer__get_app_state' }).label).toBe('电脑控制 · 观察窗口');
  expect(toolPresentation({ ...item, title: 'mcp__playwright__browser_fill_form' }).label).toBe('浏览器 · 填写表单');
  expect(toolPresentation({ ...item, title: 'mcp__custom__action' }).label).toBe('custom · action');
  expect(toolPresentation({ ...item, title: 'mcp__search__new_tool' }).label).toBe('联网搜索 · new_tool');
});
it('首页明确显示任务的实际项目', () => {
  render(<Welcome hasModel loading={false} onModels={() => {}} onPrompt={() => {}} workspaceTitle="报价计算器" />);
  expect(screen.getByText('本次任务将在「报价计算器」中进行。可从左上角切换项目。')).toBeTruthy();
  expect(screen.queryByText(/直接使用默认工作区/)).toBeNull();
});
it('首次使用提供连接入口，有模型后展示具体任务示例', () => {
  const onModels = vi.fn(), onPrompt = vi.fn();
  const view = render(<Welcome hasModel={false} loading={false} onModels={onModels} onPrompt={onPrompt} />);
  fireEvent.click(screen.getByRole('button', { name: '连接我的模型' })); expect(onModels).toHaveBeenCalledOnce();
  view.rerender(<Welcome hasModel loading={false} onModels={onModels} onPrompt={onPrompt} />);
  expect(screen.queryByRole('button', { name: '连接我的模型' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '排查问题' })); expect(onPrompt).toHaveBeenCalledWith(expect.stringContaining('报错信息'));
});
it('执行记录只分组显示，不把工具返回或文字推断成任务成功', () => {
  const items = [
    { id: 1, role: 'tool' as const, time: 1, title: 'read', text: '{"file_path":"src/main.ts"}' },
    { id: 2, role: 'tool' as const, time: 2, text: 'error: missing' },
    { id: 3, role: 'error' as const, time: 3, text: '失败' },
    { id: 4, role: 'tool' as const, time: 4, text: 'done' },
  ];
  expect(outputBlocks(items).map(block => block.kind)).toEqual(['tools', 'message', 'tools']);
  expect(toolPresentation(items[0])).toEqual({ label: '读取文件', preview: 'src/main.ts' });
  expect(toolPresentation(items[1])).toEqual({ label: '工具结果', preview: '' });
  expect(items).toHaveLength(4);
});
it('默认折叠工具记录，用户能展开详情并复制完整 Markdown 回复', async () => {
  window.kuade = { call: vi.fn().mockResolvedValue(undefined) } as any;
  const events = [
    { seq: 1, type: 'assistant/message', time: 1, data: { content: [{ type: 'tool_use', name: 'read', input: { file_path: 'main.ts' } }] } },
    { seq: 2, type: 'tool/result', time: 2, data: { content: '真实返回' } },
    { seq: 3, type: 'assistant/message', time: 3, data: { content: [{ type: 'text', text: '## 结果\n\n原始 **Markdown**' }] } },
  ];
  const { container } = render(<Timeline view={{ ...emptyView, events }} running={false} onLoadMore={() => {}} />);
  const group = container.querySelector('details.tool-group') as HTMLDetailsElement;
  expect(group.open).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '展开执行过程' }));
  await waitFor(() => expect(group.open).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: '复制回复' }));
  await screen.findByText('已复制回复');
  expect(window.kuade.call).toHaveBeenCalledWith('app/copy-text', { text: '## 结果\n\n原始 **Markdown**' });
});
it('阅读旧消息时新输出不抢滚动位置，加载历史后保持视线位置', () => {
  let height = 1000;
  const event = (seq: number) => ({ seq, type: 'user/message', time: seq, data: { content: `记录 ${seq}` } });
  const onLoadMore = vi.fn(); const events = [event(10)];
  const view = render(<Timeline view={{ ...emptyView, events, hasMore: true }} running onLoadMore={onLoadMore} />);
  const element = view.container.querySelector('.timeline') as HTMLElement;
  Object.defineProperty(element, 'scrollHeight', { get: () => height });
  Object.defineProperty(element, 'clientHeight', { value: 400 });
  element.scrollTop = 100; fireEvent.scroll(element);
  view.rerender(<Timeline view={{ ...emptyView, events, hasMore: true, live: { id: 'x', text: '新输出', revision: 1, nextIndex: 1 } }} running onLoadMore={onLoadMore} />);
  expect(element.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole('button', { name: '加载更早的消息' })); expect(onLoadMore).toHaveBeenCalledOnce();
  height = 1200;
  view.rerender(<Timeline view={{ ...emptyView, events: [event(1), ...events] }} running onLoadMore={onLoadMore} />);
  expect(element.scrollTop).toBe(300);
  fireEvent.click(screen.getByRole('button', { name: '回到最新消息 ↓' })); expect(element.scrollTop).toBe(1200);
});
