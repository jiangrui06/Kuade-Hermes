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
    expect(progress).toMatchObject({ label: '待继续', completed: 1, canContinue: true });
    expect(taskProgress({ events: [{ type: 'assistant/message', data: { content: '所有测试通过' } }] }).label).toBe('已保存');
    expect(taskProgress({ events: ended('completed'), projections: { todos: todos.map(item => ({ ...item, status: 'completed' })) } })).toMatchObject({ label: '本轮结束', canContinue: false });
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
