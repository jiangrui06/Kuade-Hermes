import { useEffect, useRef } from 'react';

/** 应用级快捷键动作。模块独立于 Electron 与上游运行层，仅处理界面导航。 */
export type AppShortcut = 'new-task' | 'self-iteration' | 'model-connection' | 'task-history';

/** 解析键盘事件：Ctrl+N 新建任务，Ctrl+Shift+I 打开自我迭代页，Ctrl+Shift+M 打开模型连接页，Ctrl+Shift+H 打开任务记录页。返回 null 表示不接管。 */
export function resolveShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey'>): AppShortcut | null {
  if (!event.ctrlKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'n') return 'new-task';
  if (key === 'i') return 'self-iteration';
  if (key === 'm') return 'model-connection';
  if (key === 'h') return 'task-history';
  return null;
}

/** 需要 Shift 组合键的动作；Ctrl+N 沿用此前不要求 Shift 状态的宽松匹配。 */
const shifted: ReadonlySet<AppShortcut> = new Set(['self-iteration', 'model-connection', 'task-history']);

/**
 * 注册全局快捷键，动作回调变化时无需重挂监听。
 * 新增动作（model-connection、task-history）可选：未提供回调的调用方保持原有行为，对应组合不会被接管。
 */
export function useAppShortcuts(actions: Record<'new-task' | 'self-iteration', () => void> & Partial<Record<'model-connection' | 'task-history', () => void>>) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const shortcut = resolveShortcut(event);
      if (!shortcut) return;
      if (shifted.has(shortcut) && !event.shiftKey) return;
      const handler = ref.current[shortcut];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
