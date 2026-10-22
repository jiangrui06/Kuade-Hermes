import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Target } from 'lucide-react';
import './goal.css';

interface Goal {
  id: string; revision: number; objective: string;
  phase: 'active' | 'paused' | 'blocked' | 'complete';
  activation: 'armed' | 'disarmed'; roundsStarted: number; maxGoalRounds: number;
  blockedReason?: { code: string; message: string };
}
export function goalLabel(goal: Goal) {
  if (goal.phase === 'active') return goal.activation === 'armed' ? '持续执行已开启' : '等待恢复目标';
  return { paused: '目标已暂停', blocked: '目标等待处理', complete: 'Agent 报告目标完成' }[goal.phase];
}

/** Upstream owns durable state and continuation. This surface only reads and requests lifecycle actions. */
export function GoalPanel({ sessionId, ready, running, revision, onCreate }: {
  sessionId: string; ready: boolean; running: boolean; revision?: number;
  onCreate(objective: string, rounds: number): Promise<boolean>;
}) {
  const [snapshot, setSnapshot] = useState<{ sessionId: string; goal?: Goal }>();
  const [objective, setObjective] = useState(''); const [rounds, setRounds] = useState('256');
  const [error, setError] = useState(''); const [readError, setReadError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0); const generation = useRef(0); const locked = useRef(false);
  const goal = snapshot?.sessionId === sessionId ? snapshot.goal : undefined;
  const unavailable = !!sessionId && (loading || snapshot?.sessionId !== sessionId || !!readError);
  useEffect(() => { setError(''); }, [sessionId]);
  useEffect(() => {
    return window.kuade.onEvent(event => {
      if (event.kind !== 'stream' || event.id !== 'events' || event.value.type !== 'emit') return;
      if (event.value.event === 'goal/activation-changed' && event.value.args?.[0]?.sessionId === sessionId) {
        ++generation.current; setRefresh(value => value + 1);
      }
    });
  }, [sessionId]);
  useEffect(() => {
    const ticket = ++generation.current; let active = true;
    setReadError('');
    if (!sessionId || !ready) { setLoading(false); return; }
    setLoading(true);
    void window.kuade.call('goals/get', { agentId: sessionId }).then(value => {
      if (active && ticket === generation.current) setSnapshot({ sessionId, goal: value ?? undefined });
    }).catch(e => { if (active && ticket === generation.current) setReadError(e.message); })
      .finally(() => { if (active && ticket === generation.current) setLoading(false); });
    return () => { active = false; ++generation.current; };
  }, [sessionId, ready, revision, running, refresh]);
  const act = async (action: 'pause' | 'resume') => {
    if (!goal || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const selected = sessionId; const ticket = ++generation.current;
    try {
      const value = await window.kuade.call(`goals/${action}`, { agentId: selected, ref: { id: goal.id, revision: goal.revision } });
      if (ticket === generation.current) setSnapshot({ sessionId: selected, goal: value });
    } catch (e) { if (ticket === generation.current) setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); setRefresh(value => value + 1); }
  };
  const create = async () => {
    if (locked.current || !objective.trim()) return;
    const cap = Number(rounds);
    if (!Number.isSafeInteger(cap) || cap < 1) { setError('轮数上限须为正整数'); return; }
    locked.current = true; setBusy(true); setError('');
    try { if (await onCreate(objective.trim(), cap)) { setObjective(''); setRefresh(value => value + 1); } }
    catch (e) { setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  };
  return <section className="goal-panel" aria-label="持续目标">
    {goal ? <>
      <div className="goal-heading"><strong><Target size={14} />{goalLabel(goal)}</strong><span>自动轮次 {goal.roundsStarted} / {goal.maxGoalRounds}</span>
        {goal.phase === 'active' && goal.activation === 'armed' ? <button className="secondary-button" disabled={!ready || busy || unavailable} onClick={() => void act('pause')}><Pause size={13} />暂停目标</button>
          : goal.phase !== 'complete' && <button className="secondary-button" disabled={!ready || busy || unavailable || running || goal.roundsStarted >= goal.maxGoalRounds} onClick={() => void act('resume')}><Play size={13} />恢复目标</button>}
      </div>
      <p className="goal-objective" tabIndex={0} aria-label="目标正文">{goal.objective}</p>
      {goal.blockedReason && <p role="status">{goal.blockedReason.message}</p>}
      <small>{goal.phase === 'complete' ? '完成状态由 Agent 更新，请结合文件和独立测试验收。' : goal.roundsStarted >= goal.maxGoalRounds ? '已达到自动轮数上限。保留当前记录，可另开任务继续安排。' : goal.activation === 'disarmed' ? '目标记录已保留；点击恢复后才会自动继续。' : '按目标跨轮继续；暂停会停止本轮。重启后需要手动恢复。'}</small>
    </> : <details><summary><Target size={14} />设置持续目标</summary>
      <p>适用于多步骤长任务，沿用所选模型与执行模式。后台继续会持续使用模型额度。</p>
      <label>目标要求<textarea aria-label="持续目标要求" value={objective} onChange={event => setObjective(event.target.value)} disabled={busy} /></label>
      <div className="goal-form-row"><label>自动轮数上限<input aria-label="自动轮数上限" type="number" min="1" step="1" value={rounds} onChange={event => setRounds(event.target.value)} disabled={busy} /></label>
        <button className="secondary-button" disabled={!ready || busy || unavailable || running || !objective.trim()} onClick={() => void create()}>开始持续目标</button></div>
    </details>}
    {(error || readError) && <div role="alert">{error || readError}<button className="text-button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>重试读取目标</button></div>}
  </section>;
}
