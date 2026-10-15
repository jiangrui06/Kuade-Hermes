import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { resolveShortcut, useAppShortcuts } from '../src/renderer/features/shortcuts';

afterEach(cleanup);

/** 模拟导航页切换的最小宿主组件，复用与 App 相同的快捷键注册方式。 */
function Host() {
  const [page, setPage] = useState<'workbench' | 'iteration'>('workbench');
  const [fresh, setFresh] = useState(false);
  useAppShortcuts({
    'new-task': () => { setFresh(true); setPage('workbench'); },
    'self-iteration': () => setPage('iteration'),
  });
  return <div>页面:{page}{fresh ? '|新任务' : ''}</div>;
}

it('Ctrl+Shift+I 打开自我迭代页，Ctrl+N 保留新建任务行为', () => {
  render(<Host />);
  fireEvent.keyDown(window, { key: 'I', ctrlKey: true, shiftKey: true });
  expect(screen.getByText(/页面:iteration/)).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
  expect(screen.getByText(/页面:workbench\|新任务/)).toBeInTheDocument();
});

it('不匹配的组合不会接管事件：普通 I、Ctrl+I（无 Shift）与 Alt 组合', () => {
  render(<Host />);
  fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'i', shiftKey: true });
  fireEvent.keyDown(window, { key: 'i', ctrlKey: true, shiftKey: true, altKey: true });
  expect(screen.getByText('页面:workbench')).toBeInTheDocument();
});

it('快捷键阻止浏览器默认行为，仅接管的组合会 preventDefault', () => {
  render(<Host />);
  const iteration = new KeyboardEvent('keydown', { key: 'I', ctrlKey: true, shiftKey: true, cancelable: true });
  window.dispatchEvent(iteration);
  expect(iteration.defaultPrevented).toBe(true);
  const plain = new KeyboardEvent('keydown', { key: 'i', cancelable: true });
  window.dispatchEvent(plain);
  expect(plain.defaultPrevented).toBe(false);
});

it('大小写归一化支持 Ctrl+Shift+N 新建任务', () => {
  render(<Host />);
  fireEvent.keyDown(window, { key: 'N', ctrlKey: true, shiftKey: true });
  expect(screen.getByText(/新任务/)).toBeInTheDocument();
});

it('动作回调更新后无需重挂监听，卸载后监听被移除', () => {
  const original = vi.fn(); const updated = vi.fn();
  function Listener({ action }: { action(): void }) {
    useAppShortcuts({ 'new-task': action, 'self-iteration': () => {} });
    return null;
  }
  const view = render(<Listener action={original} />);
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
  expect(original).toHaveBeenCalledTimes(1);
  view.rerender(<Listener action={updated} />);
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
  expect(original).toHaveBeenCalledTimes(1);
  expect(updated).toHaveBeenCalledTimes(1);
  view.unmount();
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
  expect(updated).toHaveBeenCalledTimes(1);
});

it('resolveShortcut 纯函数区分大小写与非 Ctrl 组合', () => {
  expect(resolveShortcut({ key: 'n', ctrlKey: true, altKey: false } as KeyboardEvent)).toBe('new-task');
  expect(resolveShortcut({ key: 'I', ctrlKey: true, altKey: false } as KeyboardEvent)).toBe('self-iteration');
  expect(resolveShortcut({ key: 'n', ctrlKey: false, altKey: false } as KeyboardEvent)).toBeNull();
  expect(resolveShortcut({ key: 'n', ctrlKey: true, altKey: true } as KeyboardEvent)).toBeNull();
});
