import { ollamaCapabilityURL, ollamaReasoning, ollamaInput } from './model-capabilities';

type Call = (endpoint: string, args?: any) => Promise<any>;
/** Product catalog: configured connections only. Discovery never changes favorites. */
export class ModelCatalogService {
  private cached?: { value: any; time: number };
  private pending?: Promise<any>;
  private preparations = new Map<string, Promise<any>>();
  private capabilityCache = new Map<string, { value: any; time: number }>();
  constructor(private call: Call, private request: typeof fetch = fetch) {}
  invalidate() { this.cached = undefined; }
  catalog(force = false): Promise<any> {
    if (!force && this.cached && Date.now() - this.cached.time < 60_000) return Promise.resolve(this.cached.value);
    return this.pending ??= this.load().then(value => { this.cached = { value, time: Date.now() }; return value; }).finally(() => { this.pending = undefined; });
  }
  private async settings() {
    const result = await this.call('settings/describe');
    const ns = result.namespaces.find((item: any) => item.ns === 'llm-pi-ai');
    if (!ns) throw new Error('模型适配器尚未就绪');
    return ns;
  }
  private async load() {
    const ns = await this.settings();
    const upstream = await this.call('session/modelCatalog');
    const failures: any[] = [];
    const groups = await Promise.all(Object.entries(ns.value.providers ?? {}).map(async ([id, profile]: [string, any]) => {
      const saved = profile.models ?? [];
      const known = upstream.groups.find((group: any) => group.id === id)?.models ?? [];
      let discovered: any[] = [];
      try { discovered = await this.call('llm/discoverModels', { settingsNs: ns.ns, request: { provider: id, baseURL: profile.baseURL, api: profile.api } }); }
      catch { failures.push({ id, name: profile.displayName ?? id, message: '列表刷新失败，暂时显示已保存的模型' }); }
      const entries = new Map<string, any>();
      for (const item of [...saved, ...discovered]) {
        if (typeof item.id !== 'string' || !item.id) continue;
        entries.set(item.id, { ...item, ...known.find((model: any) => model.id === item.id), id: item.id, name: item.name ?? item.id });
      }
      return { id, name: profile.displayName ?? id, models: [...entries.values()] };
    }));
    return { groups, failures, default: upstream.default };
  }
  prepare(provider: string, model: string): Promise<any> {
    const key = provider + '::' + model;
    const pending = this.preparations.get(key);
    if (pending) return pending;
    const promise = this.prepareModel(provider, model).finally(() => this.preparations.delete(key));
    this.preparations.set(key, promise); return promise;
  }
  private async prepareModel(provider: string, id: string) {
    const catalog = await this.catalog();
    const candidate = catalog.groups.find((group: any) => group.id === provider)?.models.find((model: any) => model.id === id);
    if (!candidate) throw new Error('当前连接没有此模型，请刷新模型列表');
    // Retry a revision conflict from a simultaneous settings edit, always merging a fresh profile.
    for (let attempt = 0; attempt < 2; attempt++) {
      const ns = await this.settings();
      const profile = ns.value.providers?.[provider];
      if (!profile) throw new Error('模型连接已移除');
      const saved = profile.models ?? [];
      const existing = saved.find((model: any) => model.id === id);
      const next = { ...(existing ?? { id, name: candidate.name, ...(candidate.contextWindow ? { contextWindow: candidate.contextWindow } : {}), ...(candidate.maxTokens ? { maxTokens: candidate.maxTokens } : {}) }) };
      const endpoint = ollamaCapabilityURL(profile.baseURL, profile.api);
      if (endpoint && (next.reasoningEfforts === undefined || next.input === undefined)) {
        const key = endpoint + '::' + id;
        let metadata = this.capabilityCache.get(key);
        if (!metadata || Date.now() - metadata.time > 600_000) {
          try {
            // Ollama's public model metadata needs no credential. Never copy stored keys into this probe.
            const response = await this.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: id }), signal: AbortSignal.timeout(10_000), redirect: 'error' });
            if (response.ok) {
              const body = await response.json();
              metadata = { value: { reasoning: ollamaReasoning(body), input: ollamaInput(body) }, time: Date.now() };
              this.capabilityCache.set(key, metadata);
            }
          } catch { /* Unknown capability leaves provider defaults intact. */ }
        }
        if (next.reasoningEfforts === undefined && metadata?.value.reasoning !== undefined) {
          next.reasoningEfforts = metadata.value.reasoning;
          if (metadata.value.reasoning !== false) next.compat = { ...next.compat, supportsReasoningEffort: true };
        }
        if (next.input === undefined && metadata?.value.input !== undefined) next.input = metadata.value.input;
      }
      if (!existing || JSON.stringify(next) !== JSON.stringify(existing)) {
        const models = existing ? saved.map((model: any) => model.id === id ? next : model) : [...saved, next];
        try { await this.call('settings/update', { ns: ns.ns, expectedRevision: ns.revision, patch: { providers: { [provider]: { ...profile, models } } } }); }
        catch (error) { if (attempt === 0 && /revision|conflict|版本|冲突/i.test((error as Error).message)) continue; throw error; }
      }
      const updated = await this.call('session/modelCatalog');
      const model = updated.groups.find((group: any) => group.id === provider)?.models.find((model: any) => model.id === id);
      if (!model) throw new Error('引擎尚未接纳此模型，请刷新后重试');
      Object.assign(candidate, model);
      return model;
    }
  }
}
