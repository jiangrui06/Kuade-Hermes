import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GoalPanel } from '../src/renderer/features/GoalPanel';
afterEach(cleanup);
const base = { id: 'goal-1', revision: 4, objective: '修复全部测试', phase: 'active', activation: 'armed', roundsStarted: 2, maxGoalRounds: 8 };
function bridge(call = vi.fn(async () => base)) {
  let listener: (event: any) => void = () => {};
  window.kuade = { call, onEvent: vi.fn((fn: any) => { listener = fn; return () => {}; }) } as any;
  return { call, emit: (event: any) => listener(event) };
}
const props = { sessionId: 'session-1', ready: true, running: false, onCreate: vi.fn(async () => true) };
it('只有明确开始才创建，目标文字不作为命令解析，拒绝无效轮数', async () => {
  bridge(); const create = vi.fn(async () => true);
  render(<GoalPanel {...props} sessionId="" onCreate={create} />);
  fireEvent.change(screen.getByLabelText('持续目标要求'), { target: { value: 'resume' } });
  fireEvent.change(screen.getByLabelText('自动轮数上限'), { target: { value: '0' } });
  fireEvent.click(screen.getByText('开始持续目标')); expect(create).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('正整数');
  fireEvent.change(screen.getByLabelText('自动轮数上限'), { target: { value: '12' } });
  fireEvent.click(screen.getByText('开始持续目标'));
  await waitFor(() => expect(create).toHaveBeenCalledWith('resume', 12));
});
it('读取真实 activation，恢复携带当前版本；失败保留错误', async () => {
  const call = vi.fn(async (endpoint: string) => { if (endpoint === 'goals/resume') throw Error('revision changed'); return { ...base, activation: 'disarmed' }; });
  bridge(call as any); render(<GoalPanel {...props} />);
  expect(await screen.findByText('等待恢复目标')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('恢复目标')).toBeEnabled());
  fireEvent.click(screen.getByText('恢复目标'));
  await waitFor(() => expect(call).toHaveBeenCalledWith('goals/resume', { agentId: 'session-1', ref: { id: 'goal-1', revision: 4 } }));
  expect(await screen.findByRole('alert')).toHaveTextContent('revision changed');
});
it('运行中仍可暂停，重复点击只发送一次', async () => {
  let finish!: (value: any) => void;
  const call = vi.fn((endpoint: string) => endpoint === 'goals/pause' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(base));
  bridge(call as any); render(<GoalPanel {...props} running />);
  await waitFor(() => expect(screen.getByText('暂停目标')).toBeEnabled());
  fireEvent.click(screen.getByText('暂停目标')); fireEvent.click(screen.getByText('暂停目标'));
  expect(call.mock.calls.filter(([name]) => name === 'goals/pause')).toHaveLength(1);
  await act(async () => finish({ ...base, phase: 'paused', activation: 'disarmed' }));
});
it('切换会话后忽略旧会话的迟到读取', async () => {
  let resolveOld!: (value: any) => void;
  const call = vi.fn((_endpoint: string, args: any) => args.agentId === 'session-1' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ ...base, id: 'goal-2', objective: '新会话目标', activation: 'disarmed' }));
  bridge(call as any); const view = render(<GoalPanel {...props} />);
  view.rerender(<GoalPanel {...props} sessionId="session-2" />);
  expect(await screen.findByText('新会话目标')).toBeInTheDocument();
  await act(async () => resolveOld(base));
  expect(screen.queryByText('修复全部测试')).not.toBeInTheDocument();
});
it('未知状态不允许创建或恢复；完成与预算上限不会显示正在运行', async () => {
  bridge(vi.fn(async () => { throw Error('引擎离线'); }) as any); const view = render(<GoalPanel {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('引擎离线');
  fireEvent.change(screen.getByLabelText('持续目标要求'), { target: { value: '新目标' } });
  expect(screen.getByText('开始持续目标')).toBeDisabled(); view.unmount();
  bridge(vi.fn(async () => ({ ...base, phase: 'blocked', activation: 'disarmed', roundsStarted: 8, blockedReason: { code: 'round-limit', message: '轮数已用完' } })) as any);
  render(<GoalPanel {...props} />);
  expect(await screen.findByText('目标等待处理')).toBeInTheDocument();
  expect(screen.getByText('恢复目标')).toBeDisabled();
});
