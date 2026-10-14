import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Questions } from '../src/renderer/components/Questions';
afterEach(cleanup);
it('不自动提交默认选项，将用户选择关联到原始问题', async () => {
  const call = vi.fn().mockResolvedValue(true);
  Object.defineProperty(window, 'kuade', { configurable: true, value: { call, subscribe: vi.fn().mockResolvedValue(undefined), unsubscribe: vi.fn().mockResolvedValue(undefined) } });
  render(<Questions sessionId="session" pending={[{ callId: 'call', questions: [{ id: 'q', question: '下一步', options: [{ label: '继续开发' }, { label: '先看结果' }] }] }]} onError={vi.fn()} />);
  expect(call).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: '继续开发' }));
  fireEvent.click(screen.getByRole('button', { name: '提交回答' }));
  await waitFor(() => expect(call).toHaveBeenCalledWith('userQuestions/answer', { agentId: 'session', callId: 'call', answer: { answers: [{ id: 'q', selected: ['继续开发'] }] } }));
});
