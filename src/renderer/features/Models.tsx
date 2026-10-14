import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Cpu, KeyRound, Plus, Server, LoaderCircle } from 'lucide-react';
import { ModelPicker } from './ModelPicker';

export function Models({ onSaved }: { onSaved(): Promise<void> }) {
  const [namespaces, setNamespaces] = useState<any[]>([]);
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [key, setKey] = useState('');
  const [api, setApi] = useState('openai-completions');
  const [model, setModel] = useState('');
  const [context, setContext] = useState(128000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const load = async () => { const result = await window.kuade.call('settings/describe'); setNamespaces(result.namespaces); };
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, []);
  const ns = namespaces.find(item => item.ns === 'llm-pi-ai');
  const providers = ns?.value?.providers ?? {};
  const normalizedURL = baseURL.trim().replace(/\/$/, '');
  const existingProfile = providers[providerId];
  // A changed destination must not silently receive a saved connection's credential.
  const sameDestination = !!existingProfile && normalizedURL === (existingProfile.baseURL ?? '').replace(/\/$/, '') && api === (existingProfile.api ?? 'openai-completions');
  const select = (id: string) => {
    const profile = providers[id];
    setProviderId(id); setName(profile.displayName ?? id); setBaseURL(profile.baseURL ?? '');
    setApi(profile.api ?? 'openai-completions'); setModel(profile.models?.map((item: any) => item.id).join('\n') ?? '');
    setContext(profile.defaultContextWindow ?? 128000); setKey(''); setMessage('');
  };
  const clear = () => { setProviderId(''); setName(''); setBaseURL(''); setModel(''); setKey(''); setMessage(''); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(''); setSuccess(false);
    try {
      if (!ns) throw new Error('当前引擎未加载多厂商模型适配器');
      const url = new URL(baseURL);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址需要使用 http 或 https');
      const id = providerId || 'kuade-' + crypto.randomUUID().slice(0, 8);
      const ref = 'KUADE_' + id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase() + '_KEY';
      const models = [...new Set(model.split(/[\n,]/).map(value => value.trim()).filter(Boolean))].map(modelId => ({ ...providers[id]?.models?.find((item: any) => item.id === modelId), id: modelId, name: modelId, contextWindow: context }));
      if (!models.length) throw new Error('请从列表中选择至少一个模型，或展开手动填写');
      // Preserve unrelated providers and private advanced options on edit.
      const localPlaceholder = !providers[id]?.apiKeyEnv && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? 'kuade-local' : '';
      const credential = key || localPlaceholder;
      const profile = { ...providers[id], displayName: name.trim(), api, baseURL: baseURL.trim().replace(/\/$/, ''), models, defaultContextWindow: context, defaultMaxTokens: Math.min(context, 8192), ...(credential ? { apiKeyEnv: ref } : {}) };
      if (credential) await window.kuade.call('credentials/set', { ref, value: credential });
      await window.kuade.call('settings/update', { ns: ns.ns, patch: { providers: { [id]: profile } }, expectedRevision: ns.revision });
      setProviderId(id); setKey(''); await load(); await onSaved(); setSuccess(true); setMessage('模型配置已保存，可回到工作台开始任务。');
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="settings-page">
    <div className="page-eyebrow">YOUR MODELS, YOUR CHOICE</div><h1>连接你的智能。</h1><p className="page-description">使用自己的 API，或连接本机模型服务。由你选择每一次思考的引擎。</p>
    <div className="settings-grid"><aside className="provider-list"><div className="section-heading">模型连接 <span>{Object.keys(providers).length}</span></div>
      {Object.entries(providers).map(([id, value]: [string, any]) => <button className={`provider-item ${providerId === id ? 'selected' : ''}`} key={id} onClick={() => select(id)}><Cpu size={18} /><span>{value.displayName ?? id}<small>{value.models?.length ?? '多'} 个模型</small></span><ArrowUpRight size={14} /></button>)}
      <button className="add-provider" onClick={clear}><Plus size={16} /> 添加模型连接</button>
      <div className="quiet-card"><Server size={20} /><strong>模型也可以在本机</strong><p>填写本地服务地址，自动获取模型列表后选择即可。</p></div>
    </aside><form className="settings-card model-form" onSubmit={save}><div className="card-heading"><div><h2>{providerId ? '编辑模型连接' : '新建模型连接'}</h2><p>密钥仅通过本地引擎保存，不会回显。</p></div><KeyRound size={22} /></div>
      <label>连接名称<input required placeholder="例如：我的 DeepSeek / 本地 Qwen" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>接口协议<select value={api} onChange={e => setApi(e.target.value)}><option value="openai-completions">OpenAI 兼容 · Chat Completions</option><option value="openai-responses">OpenAI · Responses</option><option value="anthropic-messages">Anthropic · Messages</option></select></label>
      <label>API 地址<input required type="url" placeholder="https://api.example.com/v1" value={baseURL} onChange={e => setBaseURL(e.target.value)} /></label>
      <label>API 密钥 <span className="label-note">本机免密服务可留空；编辑时留空保留已有密钥</span><input type="password" autoComplete="new-password" placeholder={providerId ? '已存储的密钥保持不变' : '输入 API Key'} value={key} onChange={e => setKey(e.target.value)} /></label>
      <ModelPicker key={providerId || 'new'} discovery={{ settingsNs: ns?.ns, provider: sameDestination ? providerId : undefined, baseURL: normalizedURL, api, apiKey: key, hasStoredKey: sameDestination && !!existingProfile.apiKeyEnv }} value={model} onChange={setModel} />
      <details className="model-advanced"><summary>高级设置</summary><label>上下文容量<input type="number" min="4096" max="2000000" step="1" required value={context} onChange={e => setContext(Number(e.target.value))} /><span className="label-note">按模型实际支持的 tokens 填写</span></label></details>
      {message && <div className={`form-message ${success ? 'success' : 'failure'}`} role="status">{success && <Check size={16} />}{message}</div>}
      <div className="form-footer"><span>配置会用于下一次请求</span><button className="primary-button" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}保存连接 <ArrowUpRight size={15} /></button></div>
    </form></div>
  </section>;
}
