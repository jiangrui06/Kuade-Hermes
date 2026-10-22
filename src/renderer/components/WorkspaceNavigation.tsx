import { FileDiff, FolderOpen, ListTodo, MessageSquare, Plus, Puzzle, RefreshCw, Settings2 } from 'lucide-react';
import type { Task, Workspace } from '../../shared/contracts';
import { taskTitle } from '../features/session-model';

export type Page = 'workbench' | 'tasks' | 'changes' | 'tools' | 'models' | 'iteration';
export const PAGE_LABELS: Record<Page, string> = { workbench: '工作台', tasks: '任务记录', changes: '代码变更', tools: '工具与技能', models: '模型连接', iteration: '自我迭代' };
export function WorkspaceNavigation({ page, onPage, onNew, workspaces, workspaceId, onWorkspace, onOpenProject, tasks, sessionId, onTask, ready, version }: {
  page: Page; onPage(page: Page): void; onNew(): void; workspaces: Workspace[]; workspaceId: string;
  onWorkspace(id: string): void; onOpenProject(): void; tasks: Task[]; sessionId: string; onTask(id: string): void; ready: boolean; version: string;
}) {
  const item = (id: Page, Icon: typeof MessageSquare) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-label={PAGE_LABELS[id]} aria-keyshortcuts={id === 'models' ? 'Control+Shift+M' : id === 'tasks' ? 'Control+Shift+H' : id === 'iteration' ? 'Control+Shift+I' : undefined} title={id === 'models' ? '模型连接 · Ctrl+Shift+M' : id === 'tasks' ? '任务记录 · Ctrl+Shift+H' : id === 'iteration' ? '自我迭代 · Ctrl+Shift+I' : PAGE_LABELS[id]} aria-current={page === id ? 'page' : undefined} onClick={() => onPage(id)}><Icon size={18} /><span>{PAGE_LABELS[id]}</span>{id === 'tasks' && tasks.length > 0 && <span className="nav-count">{tasks.length}</span>}</button>;
  return <aside className="navigation" aria-label="主导航">
    <div className="brand"><img src="./icon.png" alt="Kuade 图标" /><span>Kuade<small>你的 AI 开发工作台</small></span></div>
    <div className="project-switcher"><FolderOpen size={16} /><select aria-label="当前项目" value={workspaceId} onChange={e => onWorkspace(e.target.value)}>{workspaces.map(workspace => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>)}</select><button aria-label="打开项目" title="打开本地项目文件夹" disabled={!ready} onClick={onOpenProject}><Plus size={16} /></button></div>
    <button className="new-task" onClick={onNew}><Plus size={18} />新任务<kbd>Ctrl N</kbd></button>
    <nav>{item('workbench', MessageSquare)}{item('tasks', ListTodo)}{item('changes', FileDiff)}</nav>
    <div className="project-section"><div className="nav-caption">最近任务</div>{tasks.length ? tasks.slice(0, 20).map(task => <button className={`recent-task ${sessionId === task.sessionId && page === 'workbench' ? 'selected' : ''}`} key={task.sessionId} data-session-id={task.sessionId} onClick={() => onTask(task.sessionId)} title={taskTitle(task)}><span className={`task-dot ${task.running ? 'running' : ''}`} /><span>{taskTitle(task)}</span></button>) : <p className="nav-empty">开始对话后，任务会保存在这里。</p>}</div>
    <nav className="nav-bottom">{item('tools', Puzzle)}{item('iteration', RefreshCw)}{item('models', Settings2)}<div className="local-status"><span className={`status-dot ${ready ? 'ready' : ''}`} /><span>{ready ? '本机运行' : '引擎连接中'}</span><span>{version ? `v${version}` : ''}</span></div></nav>
  </aside>;
}
