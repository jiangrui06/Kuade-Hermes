import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('自迭代产物：独立启动验证版本、新快捷键与原生窗口观察', async () => {
  test.skip(!process.env.KUADE_ITERATION_ARTIFACT); test.setTimeout(180000);
  const artifact = JSON.parse(await readFile(process.env.KUADE_ITERATION_ARTIFACT!, 'utf8'));
  const root = resolve('.cache/iteration-artifact-' + randomUUID()); await mkdir(root, { recursive: true });
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)), KUADE_USER_DATA: join(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: artifact.executable, args: [], cwd: dirname(artifact.executable), env });
  // Playwright uses a cmd.exe wrapper on Windows; native tools need Electron's PID.
  const receipt: any = { status: 'not-passed', artifact: artifact.executable, version: artifact.version, pid: await app.evaluate(() => process.pid) };
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    expect(await page.evaluate(() => window.kuade.call('app/info'))).toMatchObject({ version: artifact.version, packaged: true });
    receipt.windowsBefore = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ visible: window.isVisible(), minimized: window.isMinimized(), title: window.getTitle(), handle: window.getNativeWindowHandle().toString('hex') })));
    const transport = new StdioClientTransport({ command: resolve('resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
    const client = new Client({ name: 'kuade-artifact-acceptance', version: '1.0.0' });
    try {
      await client.connect(transport);
      const observed = await client.callTool({ name: 'get_app_state', arguments: { app: String(receipt.pid) } }, undefined, { timeout: 60000 });
      await writeFile(join(root, 'native-observation.json'), JSON.stringify({ ...observed, content: (observed.content as any[]).filter(row => row.type !== 'image') }, null, 2));
      for (const item of observed.content as any[]) if (item.type === 'image') await writeFile(join(root, 'native-window.png'), Buffer.from(item.data, 'base64'));
      receipt.nativeObserved = !observed.isError;
    } finally { await client.close(); await transport.close(); }
    await page.keyboard.press('Control+Shift+i');
    await expect(page.getByRole('heading', { name: '让 Kuade，继续进步。' })).toBeVisible();
    await expect(page.getByLabel('自迭代需求')).toBeVisible();
    await page.screenshot({ path: join(root, 'new-shortcut.png') });
    receipt.shortcutPassed = true;
    expect(receipt.nativeObserved, 'See native-observation.json for the actual MCP response').toBe(true);
    receipt.status = 'passed';
  } catch (error) { receipt.error = String(error); throw error; }
  finally { await app.close(); await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2)); console.log('Artifact evidence:', root); }
});
