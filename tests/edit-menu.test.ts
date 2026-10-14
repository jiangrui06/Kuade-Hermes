// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EditFlags } from 'electron';
import { buildEditMenuTemplate } from '../src/main/edit-menu';

const flags: EditFlags = { canUndo: false, canRedo: false, canCut: false, canCopy: false, canPaste: true, canDelete: false, canSelectAll: true, canEditRichly: false };

describe('原生右键编辑菜单', () => {
  it('空输入框可粘贴，未选择文本时禁用剪切和复制', () => {
    const menu = buildEditMenuTemplate({ isEditable: true, selectionText: '', editFlags: flags });
    expect(menu.find(item => item.role === 'paste')).toMatchObject({ label: '粘贴', enabled: true });
    expect(menu.find(item => item.role === 'cut')?.enabled).toBe(false);
    expect(menu.find(item => item.role === 'copy')?.enabled).toBe(false);
    expect(menu.find(item => item.role === 'undo')?.enabled).toBe(false);
  });
  it('遵循原生能力限制，密码框仍可粘贴但不强行开放复制', () => {
    const menu = buildEditMenuTemplate({ isEditable: true, selectionText: '', editFlags: { ...flags, canUndo: true, canPaste: false } });
    expect(menu.find(item => item.role === 'paste')?.enabled).toBe(false);
    expect(menu.find(item => item.role === 'copy')?.enabled).toBe(false);
    expect(menu.find(item => item.role === 'undo')?.enabled).toBe(true);
  });
  it('选中只读文本提供复制，普通空白区域不显示编辑菜单', () => {
    const context = { isEditable: false, selectionText: '只读输出', editFlags: { ...flags, canCopy: true } };
    expect(buildEditMenuTemplate(context).map(item => item.role)).toEqual(['copy', 'selectAll']);
    expect(buildEditMenuTemplate({ ...context, selectionText: '' })).toEqual([]);
  });
});
