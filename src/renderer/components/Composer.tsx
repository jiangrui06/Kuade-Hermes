import { PRODUCT_NAME } from '../../shared/branding';
import { useState } from 'react';
import { ArrowUp, Square, ChevronDown, ShieldCheck, Zap, RefreshCw } from 'lucide-react';
import { EFFORT_NAMES } from '../../shared/model-options';
export function Composer({ send, disabled, sending, running, onStop, model, setModel, catalog, mode, onMode, prompt, onPrompt, onModels, effort = '', onEffort, capability, modelsLoading, modelPreparing, onRefreshModels }: {
  send(text: string): Promise<boolean>; disabled: boolean; sending: boolean; running: boolean; onStop(): void;
  model: string; setModel(value: string): void; catalog: any; mode: string; onMode(value: string): void;
  prompt: string; onPrompt(value: string): void; onModels(): void;
  effort?: string; onEffort?(value: string): void; capability?: any; modelsLoading?: boolean; modelPreparing?: boolean; onRefreshModels?(force?: boolean): void;
}) {
  const [focused, setFocused] = useState(false);
  const submit = async () => { if (await send(prompt)) onPrompt(''); };
  const efforts = capability?.reasoning?.efforts ?? [];
  return <div className={`composer ${focused ? 'focused' : ''}`}>
    <textarea aria-label="任务需求" placeholder="描述需求，或粘贴代码与报错…" value={prompt} onChange={e => onPrompt(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!disabled && !sending) void submit(); } }} />
    <div className="composer-actions">
      <div className="composer-options">

        <label className="select-button mode-select">{mode === 'ask' ? <ShieldCheck size={15} /> : <Zap size={15} />}<select aria-label="执行模式" value={mode} onChange={e => onMode(e.target.value)} disabled={running}><option value="ask">询问模式</option><option value="auto">自动执行</option></select><ChevronDown size={12} /></label>
      </div>
      <div className="composer-options">
        {catalog.groups?.length ? <>
          <label className="select-button model-select"><select aria-label="当前模型" value={model} disabled={running || sending} onFocus={() => onRefreshModels?.(false)} onChange={e => setModel(e.target.value)}>{catalog.groups.map((group: any) => <optgroup key={group.id} label={group.name}>{group.models.map((item: any) => <option key={item.id} value={`${group.id}::${item.id}`}>{item.name || item.id}</option>)}</optgroup>)}</select><ChevronDown size={12} /></label>
          {efforts.length > 0 ? <label className="select-button effort-select"><select aria-label="思考强度" value={effort} disabled={running || sending || modelPreparing} onChange={e => onEffort?.(e.target.value)}><option value="">默认思考</option>{efforts.map((item: any) => <option key={item.id} value={item.id}>{EFFORT_NAMES[item.id] ?? item.name}</option>)}</select><ChevronDown size={12} /></label> : <span className="thinking-default">{modelPreparing ? '读取模型能力…' : ''}</span>}
          <button type="button" className="model-refresh" aria-label="刷新模型列表" title="刷新服务商模型列表" disabled={modelsLoading || running} onClick={() => onRefreshModels?.(true)}><RefreshCw size={14} className={modelsLoading ? 'spin' : ''} /></button>
        </> : <button className="text-button" onClick={onModels}>{modelsLoading ? '正在获取模型…' : '连接模型'} <ChevronDown size={12} /></button>}
        {running ? <button className="send-button stop" aria-label="停止任务" onClick={onStop}><Square size={16} fill="currentColor" /></button> : <button className="send-button" aria-label="发送任务" disabled={disabled || sending || !prompt.trim()} onClick={() => void submit()}><ArrowUp size={20} /></button>}
      </div>
    </div>
  </div>;
}
