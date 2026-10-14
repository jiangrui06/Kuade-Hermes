import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron';

type EditContext = Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>;

/** Chromium supplies the current edit capabilities, including password/read-only restrictions. */
export function buildEditMenuTemplate({ isEditable, selectionText, editFlags }: EditContext): MenuItemConstructorOptions[] {
  if (!isEditable) return selectionText.length ? [
    { role: 'copy', label: '复制', enabled: editFlags.canCopy },
    { role: 'selectAll', label: '全选', enabled: editFlags.canSelectAll },
  ] : [];
  return [
    { role: 'undo', label: '撤销', enabled: editFlags.canUndo },
    { role: 'redo', label: '重做', enabled: editFlags.canRedo },
    { type: 'separator' },
    { role: 'cut', label: '剪切', enabled: editFlags.canCut },
    { role: 'copy', label: '复制', enabled: editFlags.canCopy },
    { role: 'paste', label: '粘贴', enabled: editFlags.canPaste },
    { role: 'delete', label: '删除', enabled: editFlags.canDelete },
    { type: 'separator' },
    { role: 'selectAll', label: '全选', enabled: editFlags.canSelectAll },
  ];
}
