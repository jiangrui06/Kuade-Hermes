import { useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useModelDiscovery, type DiscoveryInput } from './model-discovery';

export function ModelPicker({ discovery, value, onChange }: { discovery: DiscoveryInput; value: string; onChange(value: string): void }) {
  const { models, state, error, ready, retry } = useModelDiscovery(discovery);
  const [query, setQuery] = useState('');
  const selected = [...new Set(value.split(/[\n,]/).map(id => id.trim()).filter(Boolean))];
  const matches = models.filter(model => `${model.id} ${model.name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id: string, checked: boolean) => onChange((checked ? [...selected, id] : selected.filter(value => value !== id)).join('\n'));
  return <div className="model-picker">
    <div className="model-picker-heading"><div><strong>选择模型</strong><span>已选择 {selected.length} 个</span></div><button type="button" className="text-button" onClick={retry} disabled={!ready || state === 'loading'}><RefreshCw size={13} />刷新列表</button></div>
    <div role="status" className="model-discovery-status">{state === 'loading' ? <><LoaderCircle size={13} className="spin" />正在获取模型列表…</> : error || (state === 'ready' ? `服务商返回 ${models.length} 个模型，请勾选需要使用的模型。` : '填写 API 地址和 Key 后自动获取；本机免密服务可留空 Key。')}</div>
    {!!models.length && <><div className="model-bulk"><button type="button" onClick={() => onChange([...new Set([...selected, ...matches.map(item => item.id)])].join('\n'))}>选择当前结果</button><button type="button" onClick={() => onChange('')}>清空选择</button></div><input aria-label="搜索模型" placeholder="搜索模型名称或 ID" value={query} onChange={event => setQuery(event.target.value)} /><div className="model-options" role="group" aria-label="可选模型">{matches.map(model => <label className="model-option" key={model.id}><input type="checkbox" checked={selected.includes(model.id)} onChange={event => toggle(model.id, event.target.checked)} /><span>{model.name ?? model.id}{model.name && model.name !== model.id && <small>{model.id}</small>}</span></label>)}{!matches.length && <p>没有匹配的模型</p>}</div></>}
    {!!selected.length && <div className="selected-models">{selected.map(id => <button type="button" key={id} aria-label={`移除模型 ${id}`} onClick={() => toggle(id, false)}>{id}<span aria-hidden="true">×</span></button>)}</div>}
    <details className="manual-models"><summary>手动填写模型（服务商不支持查询时）</summary><label>模型 ID<textarea rows={2} placeholder="每行一个模型 ID" value={value} onChange={event => onChange(event.target.value)} /></label></details>
  </div>;
}
