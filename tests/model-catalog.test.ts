import { describe, expect, it, vi } from 'vitest';
import { ModelCatalogService } from '../src/runtime/model-catalog';
import { ollamaCapabilityURL, ollamaReasoning, ollamaInput } from '../src/runtime/model-capabilities';

function fixture() {
  let profile: any = { displayName: '我的模型', baseURL: 'https://ollama.com/v1', api: 'openai-completions', apiKeyEnv: 'STORED_KEY', models: [{ id: 'saved', contextWindow: 32000 }] };
  let revision = 1;
  const call = vi.fn(async (endpoint, args) => {
    if (endpoint === 'settings/describe') return { namespaces: [{ ns: 'llm-pi-ai', revision, value: { providers: { mine: structuredClone(profile) } } }] };
    if (endpoint === 'llm/discoverModels') return [{ id: 'saved' }, { id: 'discovered', contextWindow: 64000 }];
    if (endpoint === 'session/modelCatalog') return { default: { provider: 'deepseek', model: 'deepseek-chat' }, groups: [{ id: 'deepseek', models: [{ id: 'deepseek-chat' }] }, { id: 'mine', models: profile.models.map((m: any) => ({ ...m, reasoning: m.reasoningEfforts ? { efforts: Object.keys(m.reasoningEfforts).map(id => ({ id, name: id })) } : undefined })) }] };
    if (endpoint === 'settings/update') { expect(args.expectedRevision).toBe(revision); profile = args.patch.providers.mine; revision++; return; }
    throw new Error('unexpected endpoint');
  });
  return { call, profile: () => profile };
}
describe('完整连接目录与能力', () => {
  it('仅显示已配置的服务商，包含尚未勾选的模型，刷新失败保留已保存模型', async () => {
    const f = fixture(); const service = new ModelCatalogService(f.call);
    const catalog = await service.catalog();
    expect(catalog.groups.map((g: any) => g.id)).toEqual(['mine']);
    expect(catalog.groups[0].models.map((m: any) => m.id)).toEqual(['saved', 'discovered']);
    expect(f.call.mock.calls.some(([endpoint]) => endpoint === 'settings/update')).toBe(false);
    const original = f.call.getMockImplementation()!;
    f.call.mockImplementation(async (endpoint, args) => endpoint === 'llm/discoverModels' ? Promise.reject(new Error('401 secret-value')) : original(endpoint, args));
    const fallback = await service.catalog(true);
    expect(fallback.groups[0].models.map((m: any) => m.id)).toEqual(['saved']);
    expect(JSON.stringify(fallback)).not.toContain('secret-value');
  });
  it('选择未注册模型时保留原配置，并依据真实元数据注册支持的档位', async () => {
    const f = fixture(); const request = vi.fn(async () => new Response(JSON.stringify({ thinking: { values: [false, 'low', 'high', 'max'] } }))) as any;
    const service = new ModelCatalogService(f.call, request);
    const [a, b] = await Promise.all([service.prepare('mine', 'discovered'), service.prepare('mine', 'discovered')]);
    expect(a).toEqual(b); expect(a.reasoning.efforts.map((e: any) => e.id)).toEqual(['off', 'low', 'high', 'max']);
    expect(f.profile().models[0]).toEqual({ id: 'saved', contextWindow: 32000 });
    expect(f.profile().models[1].reasoningEfforts).toEqual({ off: 'none', low: 'low', high: 'high', max: 'max' });
    expect(f.profile().apiKeyEnv).toBe('STORED_KEY');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
    await expect(service.prepare('deepseek', 'deepseek-chat')).rejects.toThrow('没有此模型');
  });
  it('未知、不支持、只有开关的思考元数据分别处理，不按模型名字猜档位', () => {
    expect(ollamaReasoning({})).toBeUndefined();
    expect(ollamaReasoning({ thinking: { values: [false] } })).toBe(false);
    expect(ollamaReasoning({ thinking: { values: [false, true] } })).toEqual({ off: 'none', high: 'high' });
    expect(ollamaReasoning({ thinking: { values: ['imagined-level'] } })).toBeUndefined();
    expect(ollamaCapabilityURL('https://other.invalid/v1', 'openai-completions')).toBeUndefined();
    expect(ollamaCapabilityURL('https://ollama.com/v1', 'anthropic-messages')).toBeUndefined();
    expect(ollamaCapabilityURL('http://localhost:11434/v1', 'openai-completions')).toBe('http://localhost:11434/api/show');
  });
  it('已有思考配置仍补齐服务声明的图片能力，显式文本限制保持不变', async () => {
    const f = fixture();
    f.profile().models[0].reasoningEfforts = { low: 'low' };
    const request = vi.fn(async () => new Response(JSON.stringify({ capabilities: ['completion', 'vision'], thinking: { values: ['high'] } }))) as any;
    const service = new ModelCatalogService(f.call, request);
    await service.prepare('mine', 'saved');
    expect(f.profile().models[0].input).toEqual(['text', 'image']);
    expect(f.profile().models[0].reasoningEfforts).toEqual({ low: 'low' });
    f.profile().models[0].input = ['text'];
    await service.prepare('mine', 'saved');
    expect(f.profile().models[0].input).toEqual(['text']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(ollamaInput({ capabilities: ['completion'] })).toEqual(['text']);
    expect(ollamaInput({})).toBeUndefined();
    expect(ollamaInput({ capabilities: [] })).toBeUndefined();
    expect(ollamaInput({ capabilities: ['vision', 1] })).toBeUndefined();
  });
});
