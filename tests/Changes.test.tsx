import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Changes } from '../src/renderer/features/Changes';
afterEach(cleanup);
it('恢复修改必须使用明确按钮并确认，取消保留内容，提交携带原始 Diff', async () => {
  const diff = 'diff --git a/file.ts b/file.ts\n-original\n+changed';
  const call = vi.fn().mockImplementation(async (method: string) => method === 'git/changes' ? { diff, files: ['file.ts'], untracked: [], branch: 'main' } : undefined);
  window.kuade = { call } as any;
  render(<Changes sessionId="task" />);
  fireEvent.click(await screen.findByText('file.ts', { selector: 'code' }));
  expect(screen.queryByText('确认恢复此文件')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '恢复 file.ts' }));
  expect(screen.getByText(/包括你手动编辑的内容/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '保留修改' }));
  expect(call.mock.calls.some(row => row[0] === 'git/restore')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '恢复 file.ts' }));
  fireEvent.click(screen.getByRole('button', { name: '确认恢复此文件' }));
  await waitFor(() => expect(call).toHaveBeenCalledWith('git/restore', { sessionId: 'task', file: 'file.ts', expectedDiff: diff }));
});

it('新增文件可以直接查看内容，返回任务不触发恢复操作', async () => {
  const call = vi.fn().mockImplementation(async (method: string) => method === 'git/changes'
    ? { diff: '', files: [], untracked: ['README.md'], branch: 'main' }
    : { kind: 'text', content: '# 项目说明\n运行 npm start' });
  window.kuade = { call } as any;
  const back = vi.fn();
  render(<Changes sessionId="task" onBack={back} />);
  fireEvent.click(await screen.findByRole('button', { name: '查看 README.md' }));
  await screen.findByText(/运行 npm start/);
  expect(call).toHaveBeenCalledWith('git/preview', { sessionId: 'task', file: 'README.md' });
  expect(screen.queryByRole('button', { name: '恢复 README.md' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '回到任务继续修改' })); expect(back).toHaveBeenCalledOnce();
  expect(call.mock.calls.some(row => row[0] === 'git/restore')).toBe(false);
});

it('快速切换文件时较慢的旧预览不会覆盖当前文件', async () => {
  let finishOld!: (value: unknown) => void;
  window.kuade = { call: vi.fn().mockImplementation((method: string, args: any) => method === 'git/changes'
    ? Promise.resolve({ diff: '', files: [], untracked: ['a.txt', 'b.txt'], branch: 'main' })
    : args.file === 'a.txt' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ kind: 'text', content: 'B 最新内容' })) } as any;
  render(<Changes sessionId="task" />);
  fireEvent.click(await screen.findByRole('button', { name: '查看 a.txt' }));
  fireEvent.click(screen.getByRole('button', { name: '查看 b.txt' }));
  await screen.findByText('B 最新内容');
  await act(async () => finishOld({ kind: 'text', content: 'A 迟到内容' }));
  expect(screen.queryByText('A 迟到内容')).toBeNull();
  expect(screen.getByText('B 最新内容')).toBeTruthy();
});

it('逐文件 Diff、预览失败、刷新与空文件提示都可见', async () => {
  const call = vi.fn().mockResolvedValue({ diff: '+全部', files: ['file.ts'], untracked: [], branch: 'main' });
  window.kuade = { call } as any;
  render(<Changes sessionId="task" />);
  await screen.findByRole('button', { name: '查看 file.ts' });
  call.mockResolvedValueOnce({ kind: 'diff', content: '+此文件' });
  fireEvent.click(screen.getByRole('button', { name: '查看 file.ts' }));
  await screen.findByText('+此文件'); expect(screen.queryByText('+全部')).toBeNull();
  call.mockRejectedValueOnce(new Error('文件已移动，请刷新'));
  fireEvent.click(screen.getByRole('button', { name: '查看 file.ts' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('文件已移动');
  fireEvent.click(screen.getByRole('button', { name: '刷新修改' })); await screen.findByText('+全部');
  call.mockResolvedValueOnce({ kind: 'text', content: '' });
  fireEvent.click(screen.getByRole('button', { name: '查看 file.ts' })); await screen.findByText('这是一个空文件。');
});
