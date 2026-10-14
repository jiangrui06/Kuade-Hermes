// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { recoverTaskList } from '../src/renderer/features/task-list';
import type { Task } from '../src/shared/contracts';

const row = (sessionId: string, blank = true): Task => ({ sessionId, blank, running: false, updatedAt: 1, projections: { kind: 'cached', asOfSeq: 2, values: {} } });
it('冷缓存中的空白标记先由真实日志投影校正，中断任务不被隐藏', async () => {
  const read = vi.fn().mockResolvedValueOnce({ asOfSeq: 37, values: { sessionListMetadata: { blank: false, lastPromptAt: 10 }, todos: [{ content: '剩余步骤', status: 'pending' }] } })
    .mockResolvedValueOnce({ asOfSeq: 2, values: { sessionListMetadata: { blank: true } } })
    .mockResolvedValueOnce({ asOfSeq: 61, values: { title: '重命名后 · 中文项目', sessionListMetadata: { blank: false } } });
  const result = await recoverTaskList([row('interrupted'), row('empty'), row('saved', false)], read);
  expect(result[0]).toMatchObject({ sessionId: 'interrupted', blank: false, updatedAt: 10, projections: { values: { todos: [{ status: 'pending' }] } } });
  expect(result.find(task => task.sessionId === 'empty')?.blank).toBe(true);
  expect(result.find(task => task.sessionId === 'saved')?.projections).toMatchObject({ kind: 'sequenced', asOfSeq: 61, values: { title: '重命名后 · 中文项目' } });
  expect(read.mock.calls.map(call => call[0])).toEqual(['interrupted', 'empty', 'saved']);
});
it('读取失败时保留入口，不将未知任务当空白；正在运行的任务无需冷读取', async () => {
  const read = vi.fn().mockRejectedValue(new Error('temporary read failure'));
  const result = await recoverTaskList([row('unknown'), { ...row('running'), running: true }], read);
  expect(result[0].blank).toBe(false);
  expect(read).toHaveBeenCalledTimes(1);
});
