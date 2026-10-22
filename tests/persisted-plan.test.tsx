import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readPersistedPlan } from '../src/renderer/features/persisted-plan';
import { usePersistedPlan } from '../src/renderer/features/use-persisted-plan';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const records = (start: number, end: number, planSeq = -1, todos: unknown[] = []) => Array.from({ length: end - start }, (_, index) => ({ event: { seq: start + index, type: start + index === planSeq ? 'todo/write' : 'assistant/message', data: { todos } } }));
it('查找跨页历史计划，固定快照且不请求更早的不必要页面', async () => {
  const plan = [{ content: '核对文件', status: 'pending' }];
  const read = vi.fn().mockResolvedValueOnce({ records: records(100, 200), hasMore: true })
    .mockResolvedValueOnce({ records: records(50, 100, 75, plan), hasMore: true });
  expect(await readPersistedPlan(read, 'a', { throughSeq: 300, beforeSeq: 200 })).toEqual({ seq: 75, todos: plan });
  expect(read.mock.calls.map(([request]) => [request.throughSeq, request.beforeSeq])).toEqual([[300, 200], [300, 100]]);
});
it('明确清空计划终止回溯；历史耗尽可证明无计划；分页失败不冒充空计划', async () => {
  expect(await readPersistedPlan(async () => ({ records: records(0, 2, 1), hasMore: false }), 'a', { throughSeq: 2, beforeSeq: 2 })).toEqual({ seq: 1, todos: [] });
  expect(await readPersistedPlan(async () => ({ records: records(0, 2), hasMore: false }), 'a', { throughSeq: 2, beforeSeq: 2 })).toBeUndefined();
  await expect(readPersistedPlan(async () => ({ records: records(1, 2), hasMore: false }), 'a', { throughSeq: 2, beforeSeq: 2 })).rejects.toThrow('分页不完整');
  await expect(readPersistedPlan(async () => { throw Error('offline'); }, 'a', { throughSeq: 2, beforeSeq: 2 })).rejects.toThrow('offline');
});
it('切换任务丢弃迟到响应，同一快照的重渲染不反复读取', async () => {
  let finishA!: (value: unknown) => void;
  const call = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
    .mockResolvedValue({ records: records(0, 2, 1, [{ content: 'B' }]), hasMore: false });
  vi.stubGlobal('kuade', undefined);
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call } });
  const anchor = { throughSeq: 2, beforeSeq: 2 };
  const hook = renderHook(({ id }) => usePersistedPlan(id, true, anchor), { initialProps: { id: 'a' } });
  hook.rerender({ id: 'b' });
  await waitFor(() => expect(hook.result.current.plan?.todos).toEqual([{ content: 'B' }]));
  await act(async () => finishA({ records: records(0, 2, 1, [{ content: 'A' }]), hasMore: false }));
  expect(hook.result.current.plan?.todos).toEqual([{ content: 'B' }]);
  hook.rerender({ id: 'b' }); expect(call).toHaveBeenCalledTimes(2);
});
