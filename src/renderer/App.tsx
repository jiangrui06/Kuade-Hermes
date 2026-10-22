import { PRODUCT_NAME } from '../shared/branding';
import { useEffect, useState } from 'react';
import { ArrowLeft, FileDiff, Folder, LoaderCircle, Minus, Square, X } from 'lucide-react';
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
import { GoalPanel } from './features/GoalPanel';
import { continuationPrompt, taskProgress } from './features/task-progress';
import './styles-progress.css';
import { WorkspaceNavigation, PAGE_LABELS, type Page } from './components/WorkspaceNavigation';
import { Welcome } from './components/Welcome';
import { skillPrompt, toolPrompt } from './features/capability-prompts';

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
    persistedPlan: data.persistedPlan.plan, planReadState: data.persistedPlan.state,
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
    'new-task': () => { data.setSessionId(''); setPage('workbench'); setPrompt(''); },
    'self-iteration': () => setPage('iteration'),
    'model-connection': () => setPage('models'),
    'task-history': () => setPage('tasks'),
  });
  const tasks = data.tasks.filter(task => !task.blank && (!data.workspace || task.cwd === data.workspace.path || data.workspace.sessionIds.includes(task.sessionId)));

  const selectTask = (id: string) => { data.setSessionId(id); setPage('workbench'); };
  const stop = () => { void window.kuade.call('session/cancel', { request: { sessionId: data.sessionId } }).catch(e => data.setError(e.message)); };
  const loadMore = data.loadMore;
  const newTask = () => { data.setSessionId(''); setPage('workbench'); setPrompt(''); };
  return <div className="application">
    <WorkspaceNavigation page={page} onPage={setPage} onNew={newTask} workspaces={data.workspaces} workspaceId={data.workspaceId}
      onWorkspace={id => { data.setWorkspaceId(id); data.setSessionId(''); }} onOpenProject={() => void data.openProject()}
      tasks={tasks} sessionId={data.sessionId} onTask={selectTask} ready={ready} version={version} />
    <div className="main-shell">
      <header className="titlebar"><div className="breadcrumb">{page !== 'workbench' && <button className="icon-button" aria-label="返回对话" onClick={() => setPage('workbench')}><ArrowLeft size={17} /></button>}<strong>{PAGE_LABELS[page]}</strong><span className="breadcrumb-divider">/</span><span>{data.workspace?.title ?? '默认工作区'}</span></div><div className="window-controls"><button aria-label="最小化" onClick={() => window.kuade.window('minimize')}><Minus size={15} /></button><button aria-label="最大化" onClick={() => window.kuade.window('maximize')}><Square size={12} /></button><button aria-label="关闭" onClick={() => window.kuade.window('close')}><X size={16} /></button></div></header>
      {(data.error || data.runtime.phase === 'error') && <div role="alert" className="error-banner"><span>{data.error || data.runtime.message}</span>{data.runtime.phase === 'error' && <button onClick={() => void window.kuade.restart().catch(e => data.setError(e.message))}>重新启动</button>}<button aria-label="关闭提示" onClick={() => data.setError('')}><X size={15} /></button></div>}
      {page === 'iteration' ? <Iteration ready={ready} model={data.model} effort={data.effort} onTask={(sessionId, workspaceId) => { data.setWorkspaceId(workspaceId); data.setSessionId(sessionId); setPage('workbench'); }} />
        : page === 'models' ? <Models onSaved={data.refreshModels} onDone={() => setPage('workbench')} />
        : page === 'tools' ? <Extensions ready={ready} workspaceId={data.workspaceId} sessionId={data.sessionId || undefined} modelName={data.model.split('::').slice(1).join('::')} modelInput={data.capability?.inputModalities} onUseSkill={name => { setPrompt(draft => skillPrompt(name, draft)); setPage('workbench'); }} onUseTool={name => { setPrompt(draft => toolPrompt(name, draft)); setPage('workbench'); }} />
        : page === 'changes' ? <Changes sessionId={data.sessionId} workspace={data.workspace} onBack={() => setPage('workbench')} />
        : page === 'tasks' ? <Tasks key={data.workspaceId} tasks={tasks} ready={ready} onSelect={selectTask} onBack={() => setPage('workbench')} onRename={data.renameTask} />
        : <main className={`workbench ${data.sessionId ? 'has-session' : 'new-session'}`}>
          {data.sessionId ? <>
            <div className="conversation-heading"><h2>{data.current ? taskTitle(data.current) : '开发任务'}</h2><button className="text-button" onClick={() => setPage('changes')}><FileDiff size={16} />查看修改</button></div>
            {data.view.cursor >= 0 && <TaskProgress progress={progress} disabled={!ready || data.sending || data.preparing || !!data.current?.running} onContinue={() => void data.send(continuationPrompt(progress.todos), mode)} />}
            <Timeline key={data.sessionId} view={data.view} running={!!data.current?.running} onLoadMore={() => void loadMore()} />
          </> : <Welcome hasModel={!!data.model} loading={data.loading || !ready} onModels={() => setPage('models')} onPrompt={setPrompt} workspaceTitle={data.workspace?.title} />}
          <div className="composer-container">
            <Questions sessionId={data.sessionId} pending={data.view.projections.userQuestions?.active ?? []} onError={data.setError} />
            <Approvals events={data.view.events} approvals={data.approvals.filter(item => item.event !== 'user-questions/request' || !item.request.wait?.callId)} respond={data.respond} />
            <Composer send={text => data.send(text, mode)} disabled={!ready || !data.workspace || data.preparing || !data.model} sending={data.sending} running={!!data.current?.running} onStop={stop} model={data.model} setModel={data.setModel} catalog={data.catalog} effort={data.effort} onEffort={data.setEffort} capability={data.capability} modelsLoading={data.loading} modelPreparing={data.preparing} onRefreshModels={force => void data.refreshModels(force)} mode={mode} onMode={value => void changeMode(value)} prompt={prompt} onPrompt={setPrompt} onModels={() => setPage('models')} />
            {data.modelError && <div role="status" className="model-notice">{data.modelError}</div>}
            <div className="composer-footnote"><span>{ready ? 'Enter 发送 · Shift + Enter 换行' : <><LoaderCircle size={12} className="spin" />正在连接引擎</>}</span><span>{mode === 'auto' ? '自动执行：可修改文件和运行命令' : '询问模式：需确认的操作会先征求同意'}</span></div>
            {!!data.model && <GoalPanel sessionId={data.sessionId} ready={ready && !data.preparing} running={!!data.current?.running || data.sending} revision={data.view.projections.goal?.goal?.revision} onCreate={(objective, rounds) => data.send(objective, mode, rounds)} />}
          </div>
        </main>}
      <footer className="statusbar"><span title={data.workspace?.path}><Folder size={13} />{data.workspace?.title ?? '默认工作区'}</span><span>文件与任务记录保存在本机</span></footer>
    </div>
  </div>;
}
