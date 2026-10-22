import { useEffect, useRef, useState } from 'react';
import type { IterationPhase, IterationState } from '../../shared/iteration';
import './iteration.css';
const LABELS: Record<IterationPhase, string> = { preparing: '准备源码', coding: '改进中', testing: '独立验证', building: '构建新版本', 'waiting-idle': '等待其他任务', restarting: '更新并重启', completed: '更新完成', 'rolled-back': '已回退旧版本', failed: '需要处理', cancelled: '已停止' };
const TERMINAL = new Set<IterationPhase>(['completed', 'rolled-back', 'failed', 'cancelled']);
export function Iteration({ ready, model, effort, onTask }: { ready: boolean; model: string; effort: string; onTask(sessionId: string, workspaceId: string): void }) {
  const [state, setState] = useState<IterationState | null>(null);
  const [source, setSource] = useState(''); const [requirement, setRequirement] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let current = true; let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true; const request = revision.current;
      try {
        const next: IterationState | null = await window.kuade.call('iteration/status');
        if (!current || request !== revision.current) return;
        setState(next);
        if (next) setSource(value => next.phase === 'completed' && (!value || value === next.source) ? next.candidate : value || next.source);
      } catch (value) { if (current && request === revision.current) setError((value as Error).message); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { current = false; clearInterval(timer); };
  }, []);
  const active = !!state && !TERMINAL.has(state.phase);
  const action = async (endpoint: string, args?: Record<string, unknown>) => {
    revision.current++;
    setBusy(true); setError('');
    try { setState(await window.kuade.call(endpoint, args)); }
    catch (value) { setError((value as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="settings-page iteration-page">
    <h1>自我迭代</h1>
    <p className="page-description">给自己的开发搭档一项改进需求。它会在源码副本中实现，经过独立测试和构建后自动更新并重启；新版本启动失败时尝试恢复旧版本。</p>
    <div className="iteration-steps"><div><b>1</b>选择源码与改进需求</div><div><b>2</b>自动修改并独立测试</div><div><b>3</b>验证通过后更新重启</div></div>
    <form className="settings-card iteration-form" onSubmit={event => {
      event.preventDefault(); const [provider, ...parts] = model.split('::');
      void action('iteration/start', { source, requirement, provider, model: parts.join('::'), ...(effort ? { effort } : {}) });
    }}>
      <label>Kuade 源码目录<div className="iteration-source"><input value={source} readOnly placeholder="选择当前版本的源码目录" /><button type="button" className="secondary-button" disabled={busy || active} onClick={() => void window.kuade.chooseDirectory().then(path => { if (path) setSource(path); }).catch(value => setError(value.message))}>选择源码</button></div></label>
      <label>改进需求<textarea aria-label="自迭代需求" value={requirement} disabled={busy || active} onChange={event => setRequirement(event.target.value)} placeholder="例如：增加一个可切换的深色主题，并验证切换后重启仍保留选择。" /></label>
      <p className="page-description">使用工作台选中的模型：{model.split('::').slice(1).join('::') || model || '请先连接并选择模型'}。原源码、旧版本和模型连接保留；构建需要 npm，修改原生电脑控制组件时还需要 Go。</p>
      <div className="form-footer"><span>当前支持 Windows x64；至少预留 3 GiB 构建空间</span><button className="primary-button" disabled={busy || active || !ready || !source || !requirement.trim() || !model}>开始迭代并自动更新</button></div>
    </form>
    {error && <p className="form-message failure" role="alert">{error}</p>}
    {state && <section className="settings-card iteration-receipt" aria-label="自迭代进度">
      <div className="card-heading"><h2>{LABELS[state.phase]}</h2><span>{state.baseVersion}{state.targetVersion ? ' → ' + state.targetVersion : ''}</span></div>
      <p role="status">{state.message}</p><p>{state.requirement}</p>
      <details><summary>源码与验证记录</summary><p>候选源码：<code>{state.candidate}</code></p><p>验证记录：<code>{state.evidence}</code></p></details>
      <div className="form-footer"><span>构建与测试结果由宿主记录</span><div className="iteration-actions">
        {state.sessionId && state.workspaceId && <button className="secondary-button" onClick={() => onTask(state.sessionId!, state.workspaceId!)}>查看迭代任务</button>}
        {(state.phase === 'failed' || state.phase === 'cancelled' || state.phase === 'rolled-back') && state.sessionId && <button className="secondary-button" disabled={busy || !ready} onClick={() => void action('iteration/retry')}>重新验证并更新</button>}
        {active && <button className="secondary-button" disabled={busy || state.phase === 'restarting'} onClick={() => void action('iteration/cancel')}>停止本轮</button>}
      </div></div>
    </section>}
  </section>;
}
