import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Approvals } from '../src/renderer/components/Approvals';
afterEach(cleanup);
it('兼容底座的阻塞式需求问答，不将用户问题当作权限审批', async () => {
  const item = { eventId: 'question-event', agentId: 'session', event: 'user-questions/request', request: { questions: [{ id: 'direction', question: '下一步', options: [{ label: '继续开发' }] }] } };
  const respond = vi.fn().mockResolvedValue(undefined);
  render(<Approvals approvals={[item]} respond={respond} />);
  fireEvent.click(screen.getByRole('radio', { name: '继续开发' }));
  fireEvent.click(screen.getByRole('button', { name: '提交回答' }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith(item, { kind: 'result', value: { answers: [{ id: 'direction', selected: ['继续开发'] }] } }));
});
it('审批前显示关联命令，并只提交当前请求的决定', async () => {
  const item = { eventId: 'event-one', agentId: 'session-one', event: 'approval/request', request: { toolName: 'pwsh', callId: 'call-one', reason: '运行测试' } };
  const respond = vi.fn().mockResolvedValue(undefined);
  render(<Approvals approvals={[item]} respond={respond} events={[{ type: 'assistant/message', data: { message: { content: [{ type: 'tool-call', id: 'call-one', name: 'pwsh', arguments: '{"command":"npm test"}' }] } } }]} />);
  expect(screen.getByText(/"command": "npm test"/)).toBeVisible();
  expect(respond).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '允许本次操作' }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith(item, { kind: 'result', value: 'allowed-once' }));
});
