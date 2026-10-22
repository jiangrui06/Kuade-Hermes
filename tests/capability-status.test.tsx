import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCapabilityStatus } from '../src/renderer/features/use-capability-status';

afterEach(cleanup);
it('引擎断开后丢弃旧连接结果，重连读取新注册表', async () => {
  let finish!: (value: unknown) => void;
  const call = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ observedAt: 2, servers: [] });
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call } });
  const view = renderHook(({ ready }) => useCapabilityStatus(ready), { initialProps: { ready: true } });
  view.rerender({ ready: false });
  await act(async () => finish({ observedAt: 1, servers: [{ name: 'stale' }] }));
  expect(view.result.current.report).toBeUndefined();
  view.rerender({ ready: true });
  await waitFor(() => expect(view.result.current.report?.observedAt).toBe(2));
  expect(call).toHaveBeenCalledTimes(2);
});
it('刷新失败清除旧的可用状态，保留明确错误', async () => {
  const call = vi.fn().mockResolvedValueOnce({ observedAt: 1, servers: [] }).mockRejectedValueOnce(new Error('连接中断'));
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call } });
  const view = renderHook(() => useCapabilityStatus(true));
  await waitFor(() => expect(view.result.current.report?.observedAt).toBe(1));
  act(() => view.result.current.refresh());
  await waitFor(() => expect(view.result.current.error).toBe('连接中断'));
  expect(view.result.current.report).toBeUndefined();
});
