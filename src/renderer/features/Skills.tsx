import { useEffect, useState } from 'react';
import type { ProjectSkill } from '../../shared/capabilities';

export function Skills({ ready, workspaceId, sessionId, onUse }: { ready: boolean; workspaceId?: string; sessionId?: string; onUse(name: string): void }) {
  const [skills, setSkills] = useState<ProjectSkill[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setSkills([]); setError('');
    if (!ready || !workspaceId) { setLoading(false); return; }
    setLoading(true);
    void window.kuade.call('extensions/skills', { workspaceId, ...(sessionId ? { sessionId } : {}) })
      .then(value => { if (current) setSkills(value); })
      .catch(cause => { if (current) setError(cause.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [ready, workspaceId, sessionId, revision]);
  return <section className="settings-card" aria-label="项目技能">
    <div className="card-heading"><div><h2>项目技能</h2><p>读取当前项目实际发现的 Skills。项目技能可放入 .agents/skills/技能名称/SKILL.md。</p></div><button className="secondary-button" disabled={!ready || !workspaceId || loading} onClick={() => setRevision(value => value + 1)}>刷新技能</button></div>
    {error ? <p role="alert">技能读取失败：{error}</p> : !ready ? <p>等待引擎就绪…</p> : loading ? <p>正在读取技能…</p> : !skills.length ? <p>当前项目尚未发现技能。添加 SKILL.md 后刷新。</p> : <div className="discovered-skills">{skills.map(skill => <article key={skill.name}><div><h3>{skill.name}</h3><p>{skill.description}</p>{skill.path && <small>{skill.path}</small>}</div><button className="secondary-button" onClick={() => onUse(skill.name)}>用于任务</button></article>)}</div>}
  </section>;
}
