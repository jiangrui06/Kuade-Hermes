import type { SessionView } from './session-model';

export interface PlanItem { content: string; status: 'pending' | 'in_progress' | 'completed' }
export interface TaskProgress {
  label: string;
  detail: string;
  todos: PlanItem[];
  completed: number;
  canContinue: boolean;
}

/** Only engine facts establish state; a model's closing sentence is not a success signal. */
export function taskProgress({ running = false, ready = true, waiting = '', events = [], projections = {} }: {
  running?: boolean; ready?: boolean; waiting?: string;
  events?: SessionView['events']; projections?: SessionView['projections'];
}): TaskProgress {
  const todos: PlanItem[] = Array.isArray(projections.todos) ? projections.todos.filter((item: any) =>
    typeof item?.content === 'string' && ['pending', 'in_progress', 'completed'].includes(item.status)) : [];
  const completed = todos.filter(item => item.status === 'completed').length;
  const result = (label: string, detail: string, canContinue = false): TaskProgress => ({ label, detail, canContinue, todos, completed });
  if (!ready) return result('等待引擎恢复', '任务记录保留在本机；引擎就绪后可以继续。');
  if (waiting) return result(waiting, '请先处理下方的确认或问题。');
  if (running) return result('进行中', todos.find(item => item.status === 'in_progress')?.content ?? 'Agent 正在处理当前任务。');
  const boundary = events.findLast(event => event.type === 'turn/start' || event.type === 'turn/end');
  const reason = boundary?.type === 'turn/end' ? boundary.data?.reason?.kind : undefined;
  if (reason === 'interrupted' || boundary?.type === 'turn/start') return result('已中断', '继续时会核对已有记录和文件，再处理剩余工作。', true);
  if (reason === 'aborted') return result('已停止', '任务已停止；点击继续会在原会话中开始新一轮。', true);
  if (reason === 'error') return result('执行出错', '请查看对话中的错误，处理后可继续当前任务。', true);
  if (reason === 'max-tokens') return result('输出达到上限', '本轮触及输出长度上限，可继续剩余工作。', true);
  if (reason === 'blocked') return result('等待处理', '本轮遇到阻碍，请补充信息或处理后继续。', true);
  if (todos.length && completed < todos.length) return result('待继续', '本轮已停下，计划还有未完成步骤。', true);
  if (reason === 'completed') return result('本轮结束', '本轮回复已结束；计划勾选由 Agent 更新，请结合文件和测试结果验收。');
  return result('已保存', '会话记录已保存，可以输入新要求继续。');
}

export function continuationPrompt(todos: PlanItem[]): string {
  return '继续当前任务。先核对会话记录、现有文件和测试结果，确认已经完成的工作，再处理剩余步骤；不要直接重复中断前的命令。' +
    (todos.length ? '\n上轮记录的计划（请核实状态，并用 todo_write 更新当前计划）：\n' + JSON.stringify(todos, null, 2) : '\n如有多个步骤，请用 todo_write 记录和更新计划。');
}
