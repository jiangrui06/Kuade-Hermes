import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Iteration } from '../src/renderer/features/Iteration';
import type { IterationState } from '../src/shared/iteration';

afterEach(cleanup);
const state: IterationState = { id: 'run', phase: 'coding', source: 'C:/source', candidate: 'C:/candidate', requirement: '增加主题', baseVersion: '1.0.0', targetVersion: '1.0.1', startedAt: 1, updatedAt: 2, evidence: 'C:/evidence', message: '正在执行', sessionId: 'task', workspaceId: 'workspace' };
it('使用当前模型启动独立迭代，运行期间禁用重复启动并支持取消', async () => {
  const call = vi.fn(async (endpoint: string) => endpoint === 'iteration/status' ? null : endpoint === 'iteration/cancel' ? { ...state, phase: 'cancelled', message: '已停止' } : state);
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call, chooseDirectory: async () => 'C:/source' } });
  const onTask = vi.fn();
  render(<Iteration ready model="provider::model::tag" effort="high" onTask={onTask} />);
  expect(screen.getByRole('button', { name: '开始迭代并自动更新' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '选择源码' }));
  await screen.findByDisplayValue('C:/source');
  fireEvent.change(screen.getByLabelText('自迭代需求'), { target: { value: '增加主题' } });
  fireEvent.click(screen.getByRole('button', { name: '开始迭代并自动更新' }));
  await screen.findByText('正在执行');
  expect(call).toHaveBeenCalledWith('iteration/start', { source: 'C:/source', requirement: '增加主题', provider: 'provider', model: 'model::tag', effort: 'high' });
  expect(screen.getByRole('button', { name: '开始迭代并自动更新' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '查看迭代任务' }));
  expect(onTask).toHaveBeenCalledWith('task', 'workspace');
  fireEvent.click(screen.getByRole('button', { name: '停止本轮' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已停止'));
  expect(screen.getByRole('button', { name: '重新验证并更新' })).toBeEnabled();
});
it('展示启动失败，保留需求供修正；切换期间锁住取消操作', async () => {
  const call = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('源码版本不符'));
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call, chooseDirectory: async () => 'C:/source' } });
  const view = render(<Iteration ready model="provider::model" effort="" onTask={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: '选择源码' }));
  await screen.findByDisplayValue('C:/source');
  fireEvent.change(screen.getByLabelText('自迭代需求'), { target: { value: '修复功能' } });
  fireEvent.click(screen.getByRole('button', { name: '开始迭代并自动更新' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('源码版本不符');
  expect(screen.getByLabelText('自迭代需求')).toHaveValue('修复功能');
  view.unmount(); call.mockResolvedValue({ ...state, phase: 'restarting' });
  render(<Iteration ready model="provider::model" effort="" onTask={() => {}} />);
  expect(await screen.findByRole('button', { name: '停止本轮' })).toBeDisabled();
});
it('自动重启的回执完成后，下一轮默认使用已更新的候选源码', async () => {
  let phase = 'restarting';
  const call = vi.fn(async () => ({ ...state, phase }));
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call } });
  render(<Iteration ready model="provider::model" effort="" onTask={() => {}} />);
  await screen.findByDisplayValue('C:/source'); phase = 'completed';
  await waitFor(() => expect(screen.getByDisplayValue('C:/candidate')).toBeInTheDocument(), { timeout: 4000 });
});
