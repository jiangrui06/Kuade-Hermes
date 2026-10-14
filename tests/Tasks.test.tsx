import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Tasks } from '../src/renderer/features/Tasks';
import type { Task } from '../src/shared/contracts';

afterEach(cleanup);
const tasks: Task[] = [
  { sessionId: 'a', blank: false, running: false, updatedAt: 1, cwd: 'D:/中文项目', projections: { values: { title: '历史任务', todos: [{ content: '验收', status: 'pending' }] } } },
  { sessionId: 'b', blank: false, running: true, updatedAt: 2, cwd: 'D:/Other', projections: { values: { title: 'BUILD' } } },
];
const props = () => ({ tasks, ready: true, onSelect: vi.fn(), onBack: vi.fn(), onRename: vi.fn().mockResolvedValue('已接受的名称') });
it('搜索名称和目录，状态筛选不把没有计划的历史任务当成已完成', () => {
  const p = props(); render(<Tasks {...p} />);
  fireEvent.change(screen.getByLabelText('搜索任务'), { target: { value: ' 中文项目 ' } });
  expect(screen.getByText('历史任务')).toBeInTheDocument(); expect(screen.queryByText('BUILD')).toBeNull();
  fireEvent.change(screen.getByLabelText('搜索任务'), { target: { value: 'build' } });
  expect(screen.getByText('BUILD')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('搜索任务'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('筛选任务'), { target: { value: 'unfinished' } });
  expect(screen.getByText('历史任务')).toBeInTheDocument(); expect(screen.queryByText('BUILD')).toBeNull();
  fireEvent.change(screen.getByLabelText('筛选任务'), { target: { value: 'running' } });
  fireEvent.click(screen.getByText('BUILD')); expect(p.onSelect).toHaveBeenCalledWith('b');
});
it('空白禁止保存，失败保留草稿；成功展示服务实际接受的名称', async () => {
  const p = props(); p.onRename.mockRejectedValueOnce(new Error('连接已断开'));
  render(<Tasks {...p} />);
  fireEvent.click(screen.getByLabelText('重命名 历史任务'));
  fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '  ' } });
  expect(screen.getByRole('button', { name: '保存名称' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: ' 新名字 ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('连接已断开');
  expect(screen.getByLabelText('任务名称')).toHaveValue(' 新名字 ');
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }));
  expect(await screen.findByRole('status')).toHaveTextContent('已接受的名称');
  expect(p.onRename).toHaveBeenLastCalledWith('a', '新名字');
  expect(screen.queryByLabelText('任务名称')).toBeNull();
});
it('保存期间防止重复提交；Escape 取消编辑不发请求', async () => {
  const p = props(); let complete!: (title: string) => void;
  p.onRename.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  render(<Tasks {...p} />); fireEvent.click(screen.getByLabelText('重命名 历史任务'));
  fireEvent.keyDown(screen.getByLabelText('任务名称'), { key: 'Escape' });
  expect(screen.queryByLabelText('任务名称')).toBeNull(); expect(p.onRename).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('重命名 历史任务'));
  fireEvent.submit(screen.getByLabelText('任务名称').closest('form')!);
  fireEvent.submit(screen.getByLabelText('任务名称').closest('form')!);
  expect(p.onRename).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  complete('历史任务'); await waitFor(() => expect(screen.queryByLabelText('任务名称')).toBeNull());
});
