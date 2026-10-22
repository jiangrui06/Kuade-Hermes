import { useRef, useState } from 'react';
import { ArrowUpRight, ListTodo, Pencil, Search, Terminal } from 'lucide-react';
import type { Task } from '../../shared/contracts';
import { taskTitle } from './session-model';
import { taskProgress } from './task-progress';
import './tasks.css';

type Filter = 'all' | 'running' | 'unfinished';
interface Props {
  tasks: Task[];
  ready: boolean;
  onSelect(id: string): void;
  onBack(): void;
  onRename(id: string, title: string): Promise<string>;
}
export function Tasks({ tasks, ready, onSelect, onBack, onRename }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const saving = useRef(false);
  const rows = tasks.filter(task => {
    const progress = taskProgress({ running: task.running, ready, projections: task.projections?.values });
    return `${taskTitle(task)}\n${task.cwd ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      && (filter === 'all' || (filter === 'running' ? task.running : progress.todos.some(todo => todo.status !== 'completed')));
  });
  const save = async () => {
    if (!draft.trim() || !ready || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const title = await onRename(editing, draft.trim());
      setEditing(''); setNotice(`已重命名为「${title}」`);
    } catch (cause) { setError((cause as Error).message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="tasks-page">
    <h1>任务记录</h1>
    <p className="page-description">给任务一个清晰的名字，随时找到下一步。</p>
    <div className="tasks-toolbar"><div className="task-search"><Search size={17} /><input aria-label="搜索任务" placeholder="搜索名称或项目目录…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <select aria-label="筛选任务" value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="all">全部任务</option><option value="running">进行中</option><option value="unfinished">有未完成计划</option></select><span>{rows.length} 个任务</span>
    </div>
    {notice && <p role="status" className="task-notice">{notice}</p>}
    {rows.map(task => <article className="task-record" key={task.sessionId} data-session-id={task.sessionId}>
      <button className="task-row" data-session-id={task.sessionId} onClick={() => onSelect(task.sessionId)}>
        <div className="task-row-icon"><Terminal size={20} /></div><div><strong>{taskTitle(task)}</strong><p>{task.cwd}</p></div>
        <span className={`task-state ${task.running ? 'is-running' : ''}`}>{taskProgress({ running: task.running, ready, projections: task.projections?.values }).label}</span>
        <time>{new Date(task.updatedAt).toLocaleDateString('zh-CN')}</time><ArrowUpRight size={17} />
      </button>
      <button className="rename-task" aria-label={`重命名 ${taskTitle(task)}`} disabled={!ready || busy} onClick={() => { setEditing(task.sessionId); setDraft(taskTitle(task)); setError(''); setNotice(''); }}><Pencil size={15} />重命名</button>
      {editing === task.sessionId && <form className="task-rename-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>任务名称<input aria-label="任务名称" autoFocus value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); setEditing(''); } }} /></label>
        <button className="primary-button" disabled={busy || !ready || !draft.trim()} type="submit">{busy ? '正在保存…' : '保存名称'}</button>
        <button className="secondary-button" disabled={busy} type="button" onClick={() => setEditing('')}>取消</button>
        <small>较长的名称会自动缩短；保存后显示实际名称。</small>{error && <p role="alert">{error}</p>}
      </form>}
    </article>)}
    {!rows.length && <div className="large-empty"><ListTodo size={30} /><h3>{search || filter !== 'all' ? '没有匹配的任务' : '你的第一项任务，从这里开始'}</h3><p>任务过程会保存在本机，随时回来继续。</p><button className="secondary-button" onClick={onBack}>回到工作台</button></div>}
  </section>;
}
