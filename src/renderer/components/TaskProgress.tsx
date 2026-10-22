import { Check, Circle, LoaderCircle, Play } from 'lucide-react';
import type { TaskProgress as Progress } from '../features/task-progress';

export function TaskProgress({ progress, disabled, onContinue }: { progress: Progress; disabled: boolean; onContinue: () => void }) {
  return <section className="task-progress" aria-label="任务进度">
    <div className="progress-summary"><div><strong>{progress.label}</strong><span>{progress.todos.length ? `${progress.planSource === 'history' ? '历史' : ''}计划 ${progress.completed} / ${progress.todos.length}` : progress.planReadState === 'loading' ? '正在读取历史计划' : progress.planReadState === 'error' ? '历史计划读取失败，可重新打开任务重试' : '尚无步骤计划'}</span></div>
      {progress.canContinue && <button className="secondary-button" disabled={disabled} onClick={onContinue}><Play size={13} />继续任务</button>}
    </div>
    {progress.canContinue || (progress.planSource === 'history' && progress.todos.length > 0) ? <p className="progress-detail">{progress.detail}</p> : <details className="progress-note"><summary>状态说明</summary><p className="progress-detail">{progress.detail}</p></details>}
    {progress.todos.length > 0 && <details className="plan-details"><summary>查看步骤计划 <span>{progress.planSource === 'history' ? '此前记录，请核对当前进度' : 'Agent 更新'}</span></summary>
      <ol>{progress.todos.map((item, index) => <li key={`${index}:${item.content}`} data-status={item.status}>
        {item.status === 'completed' ? <Check size={14} /> : item.status === 'in_progress' ? <LoaderCircle size={14} /> : <Circle size={13} />}
        <span>{item.content}</span><small>{item.status === 'completed' ? '已完成' : item.status === 'in_progress' ? '处理中' : '待处理'}</small>
      </li>)}</ol>
    </details>}
  </section>;
}
