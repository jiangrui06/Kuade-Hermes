import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { continuationPrompt, taskProgress } from '../src/renderer/features/task-progress';
import { TaskProgress } from '../src/renderer/components/TaskProgress';

afterEach(cleanup);
const todos = [{ content: '实现功能', status: 'completed' }, { content: '运行测试', status: 'in_progress' }, { content: '检查结果', status: 'pending' }];
const ended = (kind: string) => [{ seq: 20, type: 'turn/end', data: { reason: { kind } } }];

describe('任务进度由 Harness 记录派生', () => {
  it('本轮结束不等于计划完成；模型文本不建立成功状态', () => {
    const progress = taskProgress({ events: ended('completed'), projections: { todos } });
    expect(progress).toMatchObject({ label: '本轮结束', completed: 1, canContinue: true });
    expect(taskProgress({ events: [{ type: 'assistant/message', data: { content: '所有测试通过' } }] }).label).toBe('已保存');
    expect(taskProgress({ events: ended('completed'), projections: { todos: todos.map(item => ({ ...item, status: 'completed' })) } })).toMatchObject({ label: '本轮结束', canContinue: false });
  });
  it('目标完成但计划未勾完时保留分歧，不暗示目标仍在执行或需要续跑', () => {
    const progress = taskProgress({ events: ended('completed'), projections: { todos, goal: { goal: { phase: 'complete' } } } });
    expect(progress).toMatchObject({ label: '本轮结束', completed: 1, canContinue: false });
    render(<TaskProgress progress={progress} disabled={false} onContinue={vi.fn()} />);
    expect(screen.getByText(/计划仍有未勾选步骤/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续任务' })).not.toBeInTheDocument();
    expect(taskProgress({ events: ended('error'), projections: { goal: { goal: { phase: 'complete' } } } }).label).toBe('执行出错');
  });
  it('跨轮投影重置后保留历史计划，新的计划和明确清空优先', () => {
    const saved = { seq: 5, todos };
    const progress = taskProgress({ events: ended('interrupted'), projections: { todos: null }, persistedPlan: saved });
    expect(progress).toMatchObject({ todos, planSource: 'history', completed: 1 });
    render(<TaskProgress progress={progress} disabled={false} onContinue={vi.fn()} />);
    expect(screen.getByText('历史计划 1 / 3')).toBeInTheDocument();
    expect(taskProgress({ events: [{ seq: 30, type: 'todo/write', data: { todos: [] } }], persistedPlan: saved }).todos).toEqual([]);
    expect(taskProgress({ projections: { todos: [] }, persistedPlan: saved }).todos).toEqual([]);
    expect(taskProgress({ events: [{ seq: 30, type: 'todo/write', data: { todos } }] }).todos).toEqual(todos);
  });
  it('历史计划未读完或读取失败不宣称没有计划', () => {
    const view = render(<TaskProgress progress={taskProgress({ planReadState: 'loading' })} disabled onContinue={vi.fn()} />);
    expect(screen.getByText('正在读取历史计划')).toBeInTheDocument();
    view.rerender(<TaskProgress progress={taskProgress({ planReadState: 'error' })} disabled onContinue={vi.fn()} />);
    expect(screen.getByText(/历史计划读取失败/)).toBeInTheDocument();
    expect(screen.queryByText('尚无步骤计划')).not.toBeInTheDocument();
  });
  it.each([['aborted', '已停止'], ['interrupted', '已中断'], ['error', '执行出错'], ['max-tokens', '输出达到上限'], ['blocked', '等待处理']])('%s 保留真实原因并允许手动继续', (kind, label) => {
    expect(taskProgress({ events: ended(kind) })).toMatchObject({ label, canContinue: true });
  });
  it('新一轮、引擎断连与等待确认优先于历史结束原因', () => {
    expect(taskProgress({ events: [...ended('error'), { seq: 21, type: 'turn/start' }], running: true }).label).toBe('进行中');
    expect(taskProgress({ running: true, ready: false })).toMatchObject({ label: '等待引擎恢复', canContinue: false });
    expect(taskProgress({ running: true, waiting: '等待回答' }).label).toBe('等待回答');
    expect(taskProgress({ events: [{ type: 'turn/start' }] })).toMatchObject({ label: '已中断', canContinue: true });
    expect(taskProgress({ running: true, projections: { todos: null } }).todos).toEqual([]);
  });
  it('继续文本保留计划并要求先核对现状；不自行重放命令', () => {
    const prompt = continuationPrompt(taskProgress({ projections: { todos } }).todos);
    expect(prompt).toContain('先核对会话记录、现有文件和测试结果');
    expect(prompt).toContain('不要直接重复中断前的命令');
    expect(prompt).toContain('运行测试');
  });
  it('组件显示步骤状态、折叠列表和手动继续；准备期间禁用继续', () => {
    const onContinue = vi.fn();
    const progress = taskProgress({ events: ended('aborted'), projections: { todos } });
    const view = render(<TaskProgress progress={progress} disabled={false} onContinue={onContinue} />);
    expect(screen.getByText('计划 1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/查看步骤计划/));
    expect(screen.getByText('运行测试').closest('li')).toHaveAttribute('data-status', 'in_progress');
    fireEvent.click(screen.getByRole('button', { name: '继续任务' }));
    expect(onContinue).toHaveBeenCalledOnce();
    view.rerender(<TaskProgress progress={progress} disabled onContinue={onContinue} />);
    expect(screen.getByRole('button', { name: '继续任务' })).toBeDisabled();
    view.rerender(<TaskProgress progress={taskProgress({ running: true })} disabled onContinue={onContinue} />);
    expect(screen.queryByRole('button', { name: '继续任务' })).not.toBeInTheDocument();
  });
});
