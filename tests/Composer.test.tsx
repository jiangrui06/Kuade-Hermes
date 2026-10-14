import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '../src/renderer/components/Composer';
afterEach(cleanup);
const defaults = { disabled: false, sending: false, running: false, onStop: vi.fn(), model: '', setModel: vi.fn(), catalog: { groups: [] }, mode: 'ask', onMode: vi.fn(), prompt: '修复这个问题', onPrompt: vi.fn(), onModels: vi.fn() };
describe('任务输入交互', () => {
  it('模型列表只属于当前连接，只有声明档位的模型显示思考选择', () => {
    const catalog = { groups: [{ id: 'mine', name: '我的服务', models: [{ id: 'one' }, { id: 'two' }] }, { id: 'other', name: '另一服务', models: [{ id: 'other-model' }] }] };
    const onEffort = vi.fn();
    const view = render(<Composer {...defaults} catalog={catalog} model="mine::one" send={vi.fn()} onEffort={onEffort} capability={{ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }} />);
    expect([...screen.getByLabelText('当前模型').querySelectorAll('option')].map(option => option.value)).toEqual(['mine::one', 'mine::two']);
    fireEvent.change(screen.getByLabelText('思考强度'), { target: { value: 'high' } });
    expect(onEffort).toHaveBeenCalledWith('high');
    view.rerender(<Composer {...defaults} catalog={catalog} model="mine::two" send={vi.fn()} />);
    expect(screen.queryByLabelText('思考强度')).not.toBeInTheDocument();
  });
  it('发送失败保留用户输入，成功后清空', async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onPrompt = vi.fn(); render(<Composer {...defaults} send={send} onPrompt={onPrompt} />);
    fireEvent.click(screen.getByLabelText('发送任务'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(onPrompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('发送任务'));
    await waitFor(() => expect(onPrompt).toHaveBeenCalledWith(''));
  });
  it('Shift+Enter 和中文输入法确认键不发送任务', () => {
    const send = vi.fn(); render(<Composer {...defaults} send={send} />);
    fireEvent.keyDown(screen.getByLabelText('任务需求'), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('任务需求'), { key: 'Enter', isComposing: true });
    expect(send).not.toHaveBeenCalled();
  });
  it('引擎未就绪时禁用发送，运行时提供停止按钮', () => {
    const { rerender } = render(<Composer {...defaults} disabled send={vi.fn()} />);
    expect(screen.getByLabelText('发送任务')).toBeDisabled();
    rerender(<Composer {...defaults} running send={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('停止任务'));
    expect(defaults.onStop).toHaveBeenCalled();
  });
});
