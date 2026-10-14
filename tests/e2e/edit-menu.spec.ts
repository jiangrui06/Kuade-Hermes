import { test, expect, _electron as electron, type ElectronApplication, type Locator } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('真实桌面：模型地址、密码框和对话框的原生右键粘贴', async () => {
  const root = resolve('.cache/edit-menu-' + randomUUID());
  await mkdir(root, { recursive: true });
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), KUADE_USER_DATA: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_TEST_EXECUTABLE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
    const page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await app.evaluate(async ({ Menu, clipboard, ClipboardItem }) => {
      const state = globalThis as any;
      // Preserve all clipboard formats in memory; never log or persist their contents.
      state.menuTestClipboard = await Promise.all((await clipboard.read()).map(async item =>
        new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))),
      ));
      const popup = Menu.prototype.popup;
      Menu.prototype.popup = function (options) {
        state.menuTestLast = this;
        state.menuTestShown = false;
        this.once('menu-will-show', () => { state.menuTestShown = true; });
        return popup.call(this, options);
      };
    });
    const paste = async (field: Locator, value: string) => {
      await app!.evaluate(async ({ clipboard }, value) => { await clipboard.writeText(value); (globalThis as any).menuTestShown = false; }, value);
      await field.click({ button: 'right' });
      await expect.poll(() => app!.evaluate(() => (globalThis as any).menuTestShown)).toBe(true);
      const item = await app!.evaluate(({ BrowserWindow }) => {
        const menu = (globalThis as any).menuTestLast;
        const paste = menu.items.find((item: any) => item.role === 'paste');
        const result = { label: paste?.label, enabled: paste?.enabled };
        menu.closePopup();
        // Execute Electron's native menu item handler, not a DOM value assignment or clipboard bridge.
        const window = BrowserWindow.getAllWindows()[0];
        paste?.click({}, window, window.webContents);
        return result;
      });
      expect(item).toEqual({ label: '粘贴', enabled: true });
      await expect(field).toHaveValue(value);
    };
    await page.getByRole('button', { name: '模型连接', exact: true }).click();
    await paste(page.getByLabel('API 地址', { exact: true }), 'https://kuade-menu-fixture.invalid/v1');
    await paste(page.locator('input[type=password]'), 'kuade-menu-fixture-key');
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const composer = page.getByLabel('任务需求');
    await paste(composer, 'kuade-menu-fixture 中文任务\n第二行');
    await composer.press('Control+z');
    await expect(composer).toHaveValue('');
    await composer.press('Control+v');
    await expect(composer).toHaveValue('kuade-menu-fixture 中文任务\n第二行');
    await page.screenshot({ path: resolve(root, 'paste-result.png') });
  } finally {
    await app?.evaluate(async ({ clipboard }) => {
      if ((await clipboard.readText()).includes('kuade-menu-fixture')) {
        const formats = (globalThis as any).menuTestClipboard;
        if (formats) { if (formats.length) await clipboard.write(formats); else clipboard.clear(); }
      }
    }).catch(() => {});
    await app?.close();
  }
});
