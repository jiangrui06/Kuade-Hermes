import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

test('官方 GitHub MCP：实际下载、桌面添加、保存及工具注册', async () => {
  test.skip(process.env.KUADE_LIVE_GITHUB !== '1', 'Explicit opt-in for the official GitHub download');
  test.setTimeout(420000);
  const root = resolve('.cache/live-github-' + randomUUID()); await mkdir(root, { recursive: true });
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') };
  delete env.ELECTRON_RUN_AS_NODE;
  // This gate verifies anonymous tool discovery, never reuses another app's account.
  delete env.GITHUB_PERSONAL_ACCESS_TOKEN; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
  const app = await electron.launch({ args: ['.'], cwd: resolve('.'), env });
  const receipt: Record<string, unknown> = { status: 'not-passed', realMcp: true, accountAuthorization: 'not-tested' };
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.getByRole('button', { name: '工具与技能' }).click();
    await page.getByRole('button', { name: '添加GitHub' }).click();
    await expect.poll(async () => {
      const status = await page.getByRole('status').innerText();
      if (/失败|未完成|Error/.test(status)) throw new Error(status);
      return status;
    }, { timeout: 240000 }).toContain('工具已注册不代表已登录');
    await page.getByText('高级配置 · 自定义 MCP', { exact: true }).click();
    const config = JSON.parse(await page.getByLabel('MCP 配置').inputValue());
    expect(config.mcpServers.github.command).toContain('github-mcp-2.0.2');
    expect(config.mcpServers.github).not.toHaveProperty('env');
    await page.getByRole('button', { name: '保存并重新加载' }).click();
    await expect(page.getByRole('status')).toContainText('配置已保存', { timeout: 130000 });
    await expect.poll(async () => {
      const value = await page.evaluate(() => window.kuade.call('extensions/status'));
      return value.servers.find((row: any) => row.name === 'github')?.state;
    }, { timeout: 60000 }).toBe('registered');
    const inventory = await page.evaluate(() => window.kuade.call('extensions/status'));
    receipt.tools = inventory.servers.find((row: any) => row.name === 'github').tools.map((row: any) => row.name);
    expect((receipt.tools as string[]).some(name => name.includes('get_me'))).toBe(true);
    await page.getByRole('button', { name: '添加GitHub' }).click();
    await expect(page.getByRole('status')).toContainText('已有同名配置');
    await page.screenshot({ path: resolve(root, 'registered.png') });
    receipt.status = 'passed';
  } finally {
    await writeFile(resolve(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    await app.close(); console.log('GitHub 注册验收：', root);
  }
});
