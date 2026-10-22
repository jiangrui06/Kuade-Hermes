import { test, expect, _electron as electron } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

test('回复排版：流式代码、真实剪贴板、链接协议边界和历史重启', async () => {
  const root = resolve('.cache/message-markdown-' + randomUUID()); await mkdir(root, { recursive: true });
  const prefix = '## 开发结果\n\n```ts\n  const 名称 = "Kuade";\n';
  const suffix = '\n  console.log(名称);\n```\n\n| 模块 | 状态 |\n| --- | --- |\n| API | 通过 |\n\n- [x] 测试通过\n- [ ] 待发布\n\n[官方文档](https://example.com/docs) 预览：`http://127.0.0.1:5178`，直接访问http://127.0.0.1:5179。 [本地文件](file:///C:/fixture.txt)\n\n<script>window.fixtureExecuted=true</script>\n\n![远程图片](https://example.com/fixture.png)';
  const copiedCode = '  const 名称 = "Kuade";\n\n  console.log(名称);\n';
  let finish: (() => void) | undefined; let requests = 0;
  const held = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'markdown-fixture' }] })); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (content: string, done = false) => response.write('data: ' + JSON.stringify({ id: 'markdown', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: { content }, finish_reason: done ? 'stop' : null }] }) + '\n\n');
    if (!body.tools?.length) { send('排版验收', true); response.end('data: [DONE]\n\n'); return; }
    requests++; held.add(response); response.on('close', () => held.delete(response));
    send(prefix);
    finish = () => { send(suffix, true); response.end('data: [DONE]\n\n'); };
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as any).port;
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  let app = await launch(); let page = await app.firstWindow();
  let receipt: Record<string, unknown> = { status: 'not-passed', provider: 'controlled local SSE; real Electron, Harness, persistence and clipboard', root };
  const browserRequests: string[] = [];
  try {
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await app.evaluate(async ({ clipboard, ClipboardItem, shell }) => {
      const state = globalThis as any;
      state.markdownClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
      state.markdownLinks = []; shell.openExternal = async url => { state.markdownLinks.push(url); };
    });
    page.on('request', request => { if (request.url().includes('example.com')) browserRequests.push(request.url()); });
    await page.getByRole('button', { name: '模型连接', exact: true }).click();
    await page.getByLabel('连接名称', { exact: true }).fill('排版验收服务');
    await page.getByLabel('API 地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
    await page.getByRole('checkbox', { name: 'markdown-fixture', exact: true }).check();
    await page.getByRole('button', { name: '保存连接' }).click();
    await expect(page.getByRole('status').filter({ hasText: '模型配置已保存' })).toBeVisible();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByLabel('任务需求').fill('## 请展示排版');
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect(page.getByRole('heading', { name: '开发结果' })).toBeVisible();
    await expect(page.locator('.message-code-block pre')).toHaveText('  const 名称 = "Kuade";\n');
    await expect(page.getByText('Kuade Harness · 正在生成')).toBeVisible();
    await page.screenshot({ path: resolve(root, 'streaming.png') });
    finish!();
    await expect(page.getByLabel('发送任务', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'API', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '复制代码', exact: true }).click();
    await expect(page.getByRole('button', { name: '复制代码' })).toHaveText('已复制');
    expect(await app.evaluate(async ({ clipboard }) => clipboard.readText())).toBe(copiedCode);
    await page.getByRole('link', { name: '官方文档' }).click();
    expect(await app.evaluate(() => (globalThis as any).markdownLinks)).toEqual(['https://example.com/docs']);
    await page.getByRole('link', { name: 'http://127.0.0.1:5178', exact: true }).click();
    expect(await app.evaluate(() => (globalThis as any).markdownLinks)).toEqual(['https://example.com/docs', 'http://127.0.0.1:5178/']);
    await page.getByRole('link', { name: 'http://127.0.0.1:5179', exact: true }).click();
    expect(await app.evaluate(() => (globalThis as any).markdownLinks)).toEqual(['https://example.com/docs', 'http://127.0.0.1:5178/', 'http://127.0.0.1:5179/']);
    expect(await page.evaluate(async () => { try { await window.kuade.call('app/open-web-link', { url: 'file:///C:/fixture.txt' }); return false; } catch { return true; } })).toBe(true);
    expect(browserRequests).toEqual([]);
    expect(await page.evaluate(() => (window as any).fixtureExecuted)).toBeUndefined();
    await expect(page.locator('.message.user .message-text')).toHaveText('## 请展示排版');
    await expect(page.locator('.message-markdown img')).toHaveCount(0);
    const sessionId = await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items.find((item: any) => !item.blank)?.sessionId);
    expect(sessionId).toBeTruthy();
    await page.screenshot({ path: resolve(root, 'completed.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(root, 'narrow.png') });
    // Restore all clipboard formats before relaunch; never persist their contents.
    await app.evaluate(async ({ clipboard }, expected) => {
      if (await clipboard.readText() === expected) { const saved = (globalThis as any).markdownClipboard; if (saved?.length) await clipboard.write(saved); else clipboard.clear(); }
    }, copiedCode);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
    await expect(page.getByRole('heading', { name: '开发结果' })).toBeVisible();
    await expect(page.locator('.message-code-block pre')).toHaveText(copiedCode);
    await expect(page.getByRole('table')).toContainText('API');
    expect(requests).toBe(1);
    await page.screenshot({ path: resolve(root, 'restored.png') });
    receipt = { ...receipt, status: 'passed', application: await page.evaluate(() => window.kuade.call('app/info')), sessionId, primaryModelRequests: requests,
      checks: ['unfinished streamed code', 'GFM table and task list', 'native clipboard exact code text', 'web-link IPC dispatch with stubbed OS opener', 'main-process rejects file protocol', 'HTML inert and no image fetch', 'user text preserved', 'narrow layout', 'same persisted reply after relaunch without another model request'] };
  } finally {
    await app.evaluate(async ({ clipboard }, expected) => { if (await clipboard.readText() === expected) { const saved = (globalThis as any).markdownClipboard; if (saved) { if (saved.length) await clipboard.write(saved); else clipboard.clear(); } } }, copiedCode).catch(() => {});
    if (!page.isClosed()) await page.screenshot({ path: resolve(root, 'last-state.png') }).catch(() => {});
    await app.close(); for (const response of held) response.destroy(); server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    await writeFile(resolve(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    console.log('回复排版验收证据：', root);
  }
});
