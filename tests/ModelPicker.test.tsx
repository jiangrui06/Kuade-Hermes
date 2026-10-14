import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPicker } from '../src/renderer/features/ModelPicker';
import { Models } from '../src/renderer/features/Models';

afterEach(cleanup);
const draft = { settingsNs: 'llm-pi-ai', baseURL: 'https://fixture.invalid/v1', api: 'openai-completions', apiKey: 'fixture-only-key', hasStoredKey: false };
function bridge(call: ReturnType<typeof vi.fn>) { window.kuade = { call } as any; }

describe('模型自动发现与选择', () => {
  it('自动查询、去重、搜索并勾选模型，不要求输入 ID', async () => {
    const call = vi.fn().mockResolvedValue([{ id: 'code-a', name: 'Coder A' }, { id: 'code-b' }, { id: 'code-a' }]);
    bridge(call);
    const change = vi.fn();
    render(<ModelPicker discovery={draft} value="" onChange={change} />);
    await screen.findByRole('checkbox', { name: /code-b/ }, { timeout: 2500 });
    expect(call).toHaveBeenCalledWith('llm/discoverModels', { settingsNs: 'llm-pi-ai', request: { baseURL: draft.baseURL, api: draft.api, apiKey: draft.apiKey } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('搜索模型'), { target: { value: 'code-b' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'code-b' }));
    expect(change).toHaveBeenCalledWith('code-b');
  });
  it('已存储连接通过引擎复用凭据，界面不读取密钥', async () => {
    const call = vi.fn().mockResolvedValue([{ id: 'saved-model' }]); bridge(call);
    render(<ModelPicker discovery={{ ...draft, provider: 'kuade-saved', apiKey: '', hasStoredKey: true }} value="saved-model" onChange={vi.fn()} />);
    await screen.findByRole('checkbox', { name: 'saved-model' }, { timeout: 2500 });
    expect(call.mock.calls[0][1].request).toEqual({ provider: 'kuade-saved', baseURL: draft.baseURL, api: draft.api });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
  it('切换地址后丢弃旧请求的迟到结果', async () => {
    let oldResult!: (value: any) => void;
    const call = vi.fn().mockImplementationOnce(() => new Promise(resolve => { oldResult = resolve; })).mockResolvedValue([{ id: 'new-model' }]); bridge(call);
    const view = render(<ModelPicker discovery={draft} value="" onChange={vi.fn()} />);
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1), { timeout: 2500 });
    view.rerender(<ModelPicker discovery={{ ...draft, baseURL: 'https://new.invalid/v1' }} value="" onChange={vi.fn()} />);
    await screen.findByRole('checkbox', { name: 'new-model' }, { timeout: 2500 });
    oldResult([{ id: 'old-model' }]);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole('checkbox', { name: 'old-model' })).not.toBeInTheDocument();
  });
  it('鉴权失败给出可操作提示，保留手动入口且不回显错误中的密钥', async () => {
    bridge(vi.fn().mockRejectedValue(new Error('401 fixture-only-key')));
    const change = vi.fn();
    render(<ModelPicker discovery={draft} value="" onChange={change} />);
    await screen.findByText(/请检查 Key/, {}, { timeout: 2500 });
    expect(screen.queryByText(/fixture-only-key/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('手动填写模型（服务商不支持查询时）'));
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'manual-model' } });
    expect(change).toHaveBeenCalledWith('manual-model');
  });
  it('已有连接改成其他地址时，不向新地址自动发送保存的凭据', async () => {
    const call = vi.fn().mockImplementation(async (endpoint: string) => endpoint === 'settings/describe' ? { namespaces: [{ ns: 'llm-pi-ai', value: { providers: { 'kuade-saved': { displayName: '我的连接', api: draft.api, baseURL: draft.baseURL, apiKeyEnv: 'KUADE_SAVED_KEY', models: [{ id: 'code-a' }] } } } }] } : [{ id: 'code-a' }]); bridge(call);
    render(<Models onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /我的连接/ }));
    await screen.findByRole('checkbox', { name: 'code-a' }, { timeout: 2500 });
    fireEvent.change(screen.getByLabelText('API 地址'), { target: { value: 'https://different.invalid/v1' } });
    await new Promise(resolve => setTimeout(resolve, 850));
    expect(call.mock.calls.filter(([endpoint]) => endpoint === 'llm/discoverModels')).toHaveLength(1);
  });
});
