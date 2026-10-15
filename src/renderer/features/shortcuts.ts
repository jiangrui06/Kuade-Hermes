import { useEffect, useRef } from 'react';

/** 应用级快捷键动作。模块独立于 Electron 与上游运行层，仅处理界面导航。 */
export type AppShortcut = 'new-task' | 'self-iteration';

/** 解析键盘事件：Ctrl+N 新建任务，Ctrl+Shift+I 打开自我迭代页。返回 null 表示不接管。 */
export function resolveShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey'>): AppShortcut | null {
  if (!event.ctrlKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'n') return 'new-task';
  if (key === 'i') return 'self-iteration';
  return null;
}

/** 需要 Shift 组合键的动作；Ctrl+N 沿用此前不要求 Shift 状态的宽松匹配。 */
const shifted: ReadonlySet<AppShortcut> = new Set(['self-iteration']);

/** 注册全局快捷键，动作回调变化时无需重挂监听。 */
export function useAppShortcuts(actions: Record<AppShortcut, () => void>) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const shortcut = resolveShortcut(event);
      if (!shortcut) return;
      if (shifted.has(shortcut) && !event.shiftKey) return;
      event.preventDefault();
      ref.current[shortcut]();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
