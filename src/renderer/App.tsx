import { PRODUCT_NAME } from '../shared/branding';
import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, Code2, Cpu, FileDiff, Folder, FolderOpen, LayoutDashboard, ListTodo, LoaderCircle, Minus, Plus, Puzzle, Search, ShieldCheck, Square, X, RefreshCw } from 'lucide-react';
import { useWorkspace } from './features/use-workspace';
import { useAppShortcuts } from './features/shortcuts';
import { Models } from './features/Models';
import { taskTitle } from './features/session-model';
import { Composer } from './components/Composer';
import { Timeline } from './components/Timeline';
import { Approvals } from './components/Approvals';
import { Extensions } from './features/Extensions';
import { Tasks } from './features/Tasks';
import { Changes } from './features/Changes';
import { Iteration } from './features/Iteration';
import { Questions } from './components/Questions';
import { TaskProgress } from './components/TaskProgress';
import { continuationPrompt, taskProgress } from './features/task-progress';
import './styles-progress.css';

type Page = 'workbench' | 'tasks' | 'changes' | 'tools' | 'models' | 'iteration';
const starters = [
  { icon: Code2, title: '从一个想法开始', detail: '把需求变成可运行的功能', prompt: '先了解这个项目，和我确认需求，再制定实现和测试计划。' },
  { icon: Search, title: '找到问题的根源', detail: '定位错误，修复并验证', prompt: '帮我排查这个项目的问题。先阅读项目说明和测试配置，梳理需要我提供的信息。' },
  { icon: BookOpen, title: '读懂整个项目', detail: '看清结构，找到下一步', prompt: '阅读当前项目，介绍主要模块、启动方式和测试方法，并指出需要进一步确认的内容。' },
];
export function App() {
  const data = useWorkspace();
  const [page, setPage] = useState<Page>('workbench');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'ask' | 'auto'>('ask');
  const [version, setVersion] = useState('');

  const ready = data.runtime.phase === 'ready';
  useEffect(() => { void window.kuade.call('app/info').then(info => setVersion(info.version)).catch(() => {}); }, []);
  useEffect(() => { if (ready) void window.kuade.call('app/ready').catch(error => data.setError(error.message)); }, [ready]);
  const progress = taskProgress({ running: data.current?.running || data.sending, ready,
    projections: data.view.projections, events: data.view.events,
    waiting: data.view.projections.userQuestions?.active?.length ? '等待回答' : data.approvals.some(item => item.agentId === data.sessionId) ? '等待确认' : '' });
  useEffect(() => {
    const permission = data.view.projections.permissions?.currentValue;
    if (permission) setMode(permission === 'danger-full-access' ? 'auto' : 'ask');
    const selection = data.view.projections.modelSelection;
    const next = selection?.next ?? selection?.lastUsed;
    if (next) data.restoreSelection(next);
  }, [data.view.projections.permissions, data.view.projections.modelSelection]);
  const changeMode = async (value: string) => {
    try {
      if (value !== 'auto' && value !== 'ask') return;
      if (data.sessionId) await window.kuade.call('commands/execute', { agentId: data.sessionId, line: `/permission ${value === 'auto' ? 'danger-full-access' : 'workspace-write'}`, submittedAttachments: [] });
      setMode(value);
    } catch (e) { data.setError((e as Error).message); }
  };
  useAppShortcuts({
    'new-task': () => { data.setSessionId(''); setPage('workbench'); },
    'self-iteration': () => setPage('iteration'),
  });
  const tasks = data.tasks.filter(task => !task.blank && (!data.workspace || task.cwd === data.workspace.path || data.workspace.sessionIds.includes(task.sessionId)));

  const selectTask = (id: string) => { data.setSessionId(id); setPage('workbench'); };
  const stop = () => { void window.kuade.call('session/cancel', { request: { sessionId: data.sessionId } }).catch(e => data.setError(e.message)); };
  const loadMore = data.loadMore;
  return <div className="application">
    <aside className="navigation">
      <div className="brand"><img src="./icon.png" alt={`${PRODUCT_NAME} 图标`} /><span>Kuade<span className="brand-dot">.</span><small className="brand-subtitle">HARNESS</small></span></div>
      <button className="new-task" onClick={() => { data.setSessionId(''); setPage('workbench'); setPrompt(''); }}><Plus size={17} />新任务<kbd>Ctrl N</kbd></button>
      <div className="nav-caption">工作空间</div>
      <nav>{([{ id: 'workbench', icon: LayoutDashboard, label: '工作台' }, { id: 'tasks', icon: ListTodo, label: '任务记录' }, { id: 'changes', icon: FileDiff, label: '代码变更' }, { id: 'tools', icon: Puzzle, label: '工具与技能' }, { id: 'iteration', icon: RefreshCw, label: '自我迭代' }] as const).map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><item.icon size={18} />{item.label}{item.id === 'tasks' && tasks.length > 0 && <span className="nav-count">{tasks.length}</span>}{item.id === 'iteration' && <kbd>Ctrl Shift I</kbd>}</button>)}</nav>
      <div className="project-section"><div className="nav-caption">当前项目<button aria-label="打开项目" title="打开项目" onClick={() => void data.openProject()} disabled={!ready}><Plus size={15} /></button></div>
        {data.workspaces.length ? <label className="project-picker"><Folder size={17} /><select aria-label="当前项目" value={data.workspaceId} onChange={event => { data.setWorkspaceId(event.target.value); data.setSessionId(''); }}>{data.workspaces.map(workspace => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>)}</select></label> : <button className="empty-project" disabled={!ready} onClick={() => void data.openProject()}><FolderOpen size={17} />打开本地文件夹</button>}
        {tasks.slice(0, 6).map(task => <button className={`recent-task ${data.sessionId === task.sessionId ? 'selected' : ''}`} key={task.sessionId} data-session-id={task.sessionId} onClick={() => selectTask(task.sessionId)}><span className={`task-dot ${task.running ? 'running' : ''}`} /><span>{taskTitle(task)}</span></button>)}
      </div>
      <div className="nav-bottom"><button className={`nav-item ${page === 'models' ? 'active' : ''}`} onClick={() => setPage('models')}><Cpu size={18} />模型连接<ArrowUpRight size={14} /></button><div className="local-status"><span className={`status-dot ${ready ? 'ready' : ''}`} /><span>{ready ? '本机运行' : data.runtime.phase === 'error' ? '引擎需要处理' : '正在启动引擎'}</span><span>{version ? `v${version}` : ''}</span></div></div>
    </aside>
    <div className="main-shell"><header className="titlebar"><div className="breadcrumb"><span>工作空间</span><ChevronRight size={13} /><strong>{data.workspace?.title ?? '开始'}</strong></div><div className="titlebar-right"><span className="local-badge"><ShieldCheck size={13} /> LOCAL FIRST</span><div className="window-controls"><button aria-label="最小化" onClick={() => window.kuade?.window('minimize')}><Minus size={14} /></button><button aria-label="最大化" onClick={() => window.kuade?.window('maximize')}><Square size={11} /></button><button aria-label="关闭" onClick={() => window.kuade?.window('close')}><X size={15} /></button></div></div></header>
      {(data.error || data.runtime.phase === 'error') && <div role="alert" className="error-banner"><span>{data.error || data.runtime.message}</span>{data.runtime.phase === 'error' && <button onClick={() => void window.kuade.restart().catch(e => data.setError(e.message))}>重新启动</button>}<button aria-label="关闭提示" onClick={() => data.setError('')}><X size={15} /></button></div>}
      {page === 'iteration' ? <Iteration ready={ready} model={data.model} effort={data.effort} onTask={(sessionId, workspaceId) => { data.setWorkspaceId(workspaceId); data.setSessionId(sessionId); setPage('workbench'); }} /> : page === 'models' ? <Models onSaved={data.refreshModels} /> : page === 'tools' ? <Extensions ready={ready} workspaceId={data.workspaceId} sessionId={data.sessionId || undefined} onUseSkill={name => { setPrompt(`请使用 ${name} 技能完成以下需求：`); setPage('workbench'); }} /> : page === 'changes' ? <Changes sessionId={data.sessionId} workspace={data.workspace} /> : page === 'tasks' ? <Tasks key={data.workspaceId} tasks={tasks} ready={ready} onSelect={selectTask} onBack={() => setPage('workbench')} onRename={data.renameTask} /> : <main className={`workbench ${data.sessionId ? 'has-session' : ''}`}>
        {data.sessionId ? <><div className="conversation-heading"><div><span className="page-eyebrow">IN THE MAKING</span><h2>{data.current ? taskTitle(data.current) : '开发任务'}</h2></div><span className="task-state">{data.view.cursor < 0 ? '正在读取记录' : progress.label}</span></div>{data.view.cursor >= 0 && <TaskProgress progress={progress} disabled={!ready || data.sending || data.preparing || !!data.current?.running} onContinue={() => void data.send(continuationPrompt(progress.todos), mode)} />}<Timeline view={data.view} running={!!data.current?.running} onLoadMore={() => void loadMore()} /></> : <div className="welcome"><div className="welcome-kicker"><span className="tiny-line" /> A LITTLE FOCUS. A LOT POSSIBLE.</div><div className="hero-heading"><h1>把想法，<br />落成<span className="serif-accent">代码。</span></h1><div className="hero-symbol" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><img src="./icon.png" alt="" /><span className="orbit-node" /></div></div><p className="hero-description">你的开发搭档，从理解项目到交付改变。<br />专注下一步，把其余交给 {PRODUCT_NAME}。</p>
          <button className={`workspace-card ${data.workspace ? 'connected' : ''}`} onClick={() => void data.openProject()} disabled={!ready}><span className="folder-tile"><FolderOpen size={24} strokeWidth={1.5} /></span><span><strong>{data.workspace ? data.workspace.title : '从你的项目开始'}</strong><small>{data.workspace ? data.workspace.path : '选择本地文件夹，建立共同的上下文'}</small></span><span className="workspace-card-action">{data.workspace ? '切换项目' : '打开项目'}<ArrowUpRight size={16} /></span></button>
          <div className="starter-grid">{starters.map(item => <button className="starter-card" key={item.title} onClick={() => setPrompt(item.prompt)}><item.icon size={20} strokeWidth={1.6} /><strong>{item.title}</strong><span>{item.detail}</span><ArrowUpRight className="starter-arrow" size={15} /></button>)}</div>
        </div>}
        <div className="composer-container"><Questions sessionId={data.sessionId} pending={data.view.projections.userQuestions?.active ?? []} onError={data.setError} /><Approvals events={data.view.events} approvals={data.approvals.filter(item => item.event !== 'user-questions/request' || !item.request.wait?.callId)} respond={data.respond} /><Composer send={text => data.send(text, mode)} disabled={!ready || !data.workspace || data.preparing} sending={data.sending} running={!!data.current?.running} onStop={stop} model={data.model} setModel={data.setModel} catalog={data.catalog} effort={data.effort} onEffort={data.setEffort} capability={data.capability} modelsLoading={data.loading} modelPreparing={data.preparing} onRefreshModels={force => void data.refreshModels(force)} mode={mode} onMode={value => void changeMode(value)} prompt={prompt} onPrompt={setPrompt} onModels={() => setPage('models')} />{data.modelError && <div role="status" className="model-notice">{data.modelError}</div>}<div className="composer-footnote"><span>{ready ? <><span className="status-dot ready" />准备就绪</> : <><LoaderCircle size={12} className="spin" />{data.runtime.phase === 'error' ? '等待引擎恢复' : '正在准备本地引擎'}</>}</span><span>Enter 发送<span className="separator">·</span>Shift + Enter 换行</span></div></div>
      </main>}
      <footer className="statusbar"><span><Folder size={12} />{data.workspace?.path ?? '尚未选择项目'}</span><span>{PRODUCT_NAME}<span className="separator">/</span>让每一个想法，有迹可循。</span></footer>
    </div>
  </div>;
}
