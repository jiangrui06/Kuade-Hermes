import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageMarkdown } from '../src/renderer/components/MessageMarkdown';
import { Timeline } from '../src/renderer/components/Timeline';
import { emptyView } from '../src/renderer/features/session-model';
import { messageWebUrl } from '../src/shared/message-url';

beforeEach(() => { window.kuade = { call: vi.fn().mockResolvedValue(undefined) } as any; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('links preview URLs next to Chinese prose without consuming punctuation or rewriting examples', async () => {
  const { container } = render(<MessageMarkdown text={'启动后访问http://127.0.0.1:5178。文档https://example.com/中文?q=1，继续。\n\n```\n访问http://127.0.0.1:5178。\n```\n\n[现有](https://example.com/original)'} />);
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(container.querySelector('pre a')).toBeNull();
  expect(container.textContent).toContain('5178。文档');
  fireEvent.click(screen.getByRole('link', { name: 'http://127.0.0.1:5178' }));
  await waitFor(() => expect(window.kuade.call).toHaveBeenCalledWith('app/open-web-link', { url: 'http://127.0.0.1:5178/' }));
  expect(screen.getByRole('link', { name: 'https://example.com/中文?q=1' })).toHaveAttribute('href', 'https://example.com/%E4%B8%AD%E6%96%87?q=1');
});

it('plain-text link detection leaves credentials, emails and OS protocols inert', () => {
  render(<MessageMarkdown text={'地址https://user:pass@example.com。邮箱user@example.com，路径file:///C:/secret，设置ms-settings:test。'} />);
  // GFM may turn the email into a mailto node, but the shared web-only renderer leaves it inert.
  expect(screen.queryAllByRole('link')).toHaveLength(0);
  expect(window.kuade.call).not.toHaveBeenCalled();
});

it('inline preview URLs are clickable while fenced examples and commands remain literal', async () => {
  const { container } = render(<MessageMarkdown text={'预览 `http://127.0.0.1:5178`，运行 `npm start`。\n\n```\nhttps://example.com/sample\n```'} />);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(container.querySelector('pre a')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'http://127.0.0.1:5178' }));
  await waitFor(() => expect(window.kuade.call).toHaveBeenCalledWith('app/open-web-link', { url: 'http://127.0.0.1:5178/' }));
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  await screen.findByText('已复制');
  expect(window.kuade.call).toHaveBeenLastCalledWith('app/copy-text', { text: 'https://example.com/sample\n' });
});

it('inline code does not create nested links or activate OS protocols and credential URLs', () => {
  const { container } = render(<MessageMarkdown text={'[`https://example.com/label`](https://example.com/target) `file:///C:/secret` `ms-settings:test` `https://user:pass@example.com`'} />);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/target');
  expect(container.querySelector('a a')).toBeNull();
  expect(window.kuade.call).not.toHaveBeenCalled();
});

it('renders headings, nested lists, GFM tables, readonly tasks and inline code', () => {
  const { container } = render(<MessageMarkdown text={'## 实施计划\n\n1. 第一项\n   - 子项\n\n- [x] 已完成\n- [ ] 待执行\n\n| 模块 | 状态 |\n| --- | --- |\n| API | 通过 |\n\n使用 `npm test`，**注意** ~~旧命令~~。'} />);
  expect(screen.getByRole('heading', { name: '实施计划' })).toBeVisible();
  expect(container.querySelector('ol li ul li')).toHaveTextContent('子项');
  expect(screen.getByRole('table')).toHaveTextContent('API');
  const boxes = screen.getAllByRole('checkbox');
  expect(boxes[0]).toBeChecked(); expect(boxes[1]).not.toBeChecked(); boxes.forEach(box => expect(box).toBeDisabled());
  expect(container.querySelector('code')).toHaveTextContent('npm test');
  expect(container.querySelector('strong')).toHaveTextContent('注意');
  expect(container.querySelector('del')).toHaveTextContent('旧命令');
});

it('copies code without Markdown fences and preserves indentation, Chinese text and blank lines', async () => {
  render(<MessageMarkdown text={'```ts\n  const 名称 = "Kuade";\n\n  console.log(名称);\n```'} />);
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  await screen.findByText('已复制');
  expect(window.kuade.call).toHaveBeenCalledWith('app/copy-text', { text: '  const 名称 = "Kuade";\n\n  console.log(名称);\n' });
});

it('shows clipboard failure and allows retry', async () => {
  vi.mocked(window.kuade.call).mockRejectedValueOnce(new Error('clipboard busy'));
  render(<MessageMarkdown text={'```\nhello\n```'} />);
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  expect(await screen.findByRole('status')).toHaveTextContent('复制失败');
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  await screen.findByText('已复制'); expect(screen.queryByRole('status')).toBeNull();
});

it('renders unfinished streamed code and ignores stale copy success after new chunks', async () => {
  let resolveCopy!: () => void;
  vi.mocked(window.kuade.call).mockImplementationOnce(() => new Promise<void>(resolve => { resolveCopy = resolve; }));
  const { rerender, container } = render(<MessageMarkdown text={'```js\nconst value ='} />);
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  rerender(<MessageMarkdown text={'```js\nconst value = 42;\n```\n\n完成'} />);
  await act(async () => resolveCopy());
  expect(screen.queryByText('已复制')).toBeNull();
  expect(container.querySelector('pre')).toHaveTextContent('const value = 42;');
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  await screen.findByText('已复制');
  expect(window.kuade.call).toHaveBeenLastCalledWith('app/copy-text', { text: 'const value = 42;\n' });
});

it('opens only clicked web links, reports launch failure and leaves local links as text', async () => {
  render(<MessageMarkdown text={'[文档](https://example.com/docs?q=1#part) [本地](file:///C:/secret) [相对](../README.md)'} />);
  expect(window.kuade.call).not.toHaveBeenCalled();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  vi.mocked(window.kuade.call).mockRejectedValueOnce(new Error('no handler'));
  fireEvent.click(screen.getByRole('link', { name: '文档' }));
  await screen.findByRole('status');
  expect(window.kuade.call).toHaveBeenCalledWith('app/open-web-link', { url: 'https://example.com/docs?q=1#part' });
  fireEvent.click(screen.getByRole('link', { name: '文档' }));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
});

it('does not execute HTML, active URLs or load model-provided remote images', () => {
  const { container } = render(<MessageMarkdown text={'<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n[运行](javascript:alert%281%29) [命令](ms-settings:test) ![远程图](https://example.com/pixel.png)\n\n```html\n<img src=x onerror=alert(1)>\n```'} />);
  expect(container.querySelectorAll('script,iframe,img,a')).toHaveLength(0);
  expect(container.querySelector('pre')).toHaveTextContent('<img src=x onerror=alert(1)>');
  expect(screen.getByText('[图片：远程图]')).toBeVisible();
});

it('validates the same protocol boundary for renderer and main-process requests', () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/x', '//example.com', 'https://user:pass@example.com', 'https://example.com\n', 'https://', 'data:text/html,x', 'ms-settings:test']) expect(messageWebUrl(url)).toBeUndefined();
  expect(messageWebUrl('https://example.com/中文')).toBe('https://example.com/%E4%B8%AD%E6%96%87');
  expect(messageWebUrl('HTTP://localhost:1234/test')).toBe('http://localhost:1234/test');
});

it('renders both saved and live assistant messages while preserving user and tool text', () => {
  Element.prototype.scrollIntoView = vi.fn();
  const view = { ...emptyView, events: [
    { seq: 1, type: 'user/message', time: 1, data: { content: '## 用户原文' } },
    { seq: 2, type: 'assistant/message', time: 2, data: { content: [{ type: 'text', text: '## 已保存回复' }] } },
    { seq: 3, type: 'tool/result', time: 3, data: { content: '## 工具原文' } },
  ], live: { id: 'live', text: '## 正在生成回复', revision: 1, nextIndex: 1 } };
  const { container } = render(<Timeline view={view} running onLoadMore={() => {}} />);
  expect(screen.getByRole('heading', { name: '已保存回复' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '正在生成回复' })).toBeVisible();
  expect(container.querySelector('.message.user')).toHaveTextContent('## 用户原文');
  expect(container.querySelector('.tool-event pre')).toHaveTextContent('## 工具原文');
});
