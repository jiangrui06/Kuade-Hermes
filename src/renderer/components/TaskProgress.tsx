import { Check, Circle, LoaderCircle, Play } from 'lucide-react';
import type { TaskProgress as Progress } from '../features/task-progress';

export function TaskProgress({ progress, disabled, onContinue }: { progress: Progress; disabled: boolean; onContinue: () => void }) {
  return <section className="task-progress" aria-label="任务进度">
    <div className="progress-summary"><div><strong>{progress.label}</strong><span>{progress.todos.length ? `计划 ${progress.completed} / ${progress.todos.length}` : '尚无步骤计划'}</span></div>
      {progress.canContinue && <button className="secondary-button" disabled={disabled} onClick={onContinue}><Play size={13} />继续任务</button>}
    </div>
    <p className="progress-detail">{progress.detail}</p>
    {progress.todos.length > 0 && <details className="plan-details"><summary>查看步骤计划 <span>Agent 更新</span></summary>
      <ol>{progress.todos.map((item, index) => <li key={`${index}:${item.content}`} data-status={item.status}>
        {item.status === 'completed' ? <Check size={14} /> : item.status === 'in_progress' ? <LoaderCircle size={14} /> : <Circle size={13} />}
        <span>{item.content}</span><small>{item.status === 'completed' ? '已完成' : item.status === 'in_progress' ? '处理中' : '待处理'}</small>
      </li>)}</ol>
    </details>}
  </section>;
}
