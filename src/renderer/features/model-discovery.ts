import { useEffect, useState } from 'react';

export interface DiscoveredModel { id: string; name?: string; contextWindow?: number; maxTokens?: number }
export interface DiscoveryInput { settingsNs?: string; provider?: string; baseURL: string; api: string; apiKey: string; hasStoredKey: boolean }

export function useModelDiscovery(input: DiscoveryInput) {
  const { settingsNs, provider, baseURL, api, apiKey, hasStoredKey } = input;
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  let valid = false;
  let local = false;
  try { const url = new URL(baseURL); valid = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch { /* Draft URL is not ready. */ }
  const ready = !!settingsNs && valid && (!!apiKey.trim() || hasStoredKey || local);
  useEffect(() => {
    let cancelled = false;
    setModels([]); setError(''); setState(ready ? 'loading' : 'idle');
    if (!ready) return;
    const timer = setTimeout(() => {
      void window.kuade.call('llm/discoverModels', {
        settingsNs,
        request: { baseURL, api, ...(provider ? { provider } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      }).then((result: DiscoveredModel[]) => {
        if (cancelled) return;
        const unique = [...new Map(result.filter(model => typeof model.id === 'string' && model.id.trim()).map(model => [model.id, model])).values()];
        setModels(unique); setState('ready');
        if (!unique.length) setError('服务商返回了空列表。可以刷新，或展开下方手动填写。');
      }).catch((cause: Error) => {
        if (cancelled) return;
        const message = String(cause.message ?? '');
        const detail = /401|403/.test(message) ? '请检查 Key 及模型列表访问权限。' : /404|UNSUPPORTED|unsupported|no model listing/.test(message) ? '该地址可能不支持模型列表，请检查 API 地址，或手动填写。' : /timeout|abort|超时/i.test(message) ? '请求超时，请稍后刷新。' : '请检查 API 地址与网络，或展开下方手动填写。';
        setState('error'); setError('获取模型列表失败。' + detail);
      });
    }, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [settingsNs, provider, baseURL, api, apiKey, ready, refresh]);
  return { models, state, error, ready, retry: () => setRefresh(value => value + 1) };
}
