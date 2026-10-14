import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Explicit opt-in: live network/MCP gate; the model responses alone are controlled.
test('联网搜索：桌面通过真实 MCP 搜索并读取官方页面', async () => {
  test.skip(process.env.KUADE_LIVE_MCP !== '1', 'Requires explicit live network acceptance');
  test.setTimeout(240000);
  const root = resolve('.cache/live-search-' + randomUUID());
  await mkdir(root, { recursive: true });
  const receipts: any[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'search-acceptance' }] })); return;
    }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const results = body.messages.filter((item: any) => item.role === 'tool');
    receipts.push(...results.filter((item: any) => !receipts.some(row => row.tool_call_id === item.tool_call_id)));
    const tool = results.length === 0 ? { name: 'mcp__search__search', arguments: { query: 'Electron app relaunch official documentation', max_results: 3 } }
      : results.length === 1 ? { name: 'mcp__search__fetch_content', arguments: { url: 'https://www.electronjs.org/docs/latest/api/app', max_length: 5000 } } : null;
    const delta = tool ? { tool_calls: [{ index: 0, id: 'live-' + results.length, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }] } : { content: '搜索调用流程结束，结果由外部验收器核对。' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [{ delta: { role: 'assistant' }, finish_reason: null }, { delta, finish_reason: null }, { delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }]) {
      response.write('data: ' + JSON.stringify({ id: 'live-search', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, ...choice }] }) + '\n\n');
    }
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: resolve('.'), env });
  let status = 'not-passed';
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    // Use the same product IPC as settings; secrets here are fixture-only.
    await page.evaluate(async ({ port, uvx }) => {
      const ns = (await window.kuade.call('settings/describe')).namespaces.find((item: any) => item.ns === 'llm-pi-ai');
      await window.kuade.call('credentials/set', { ref: 'KUADE_ACCEPTANCE_KEY', value: 'fixture-only' });
      await window.kuade.call('settings/update', { ns: ns.ns, expectedRevision: ns.revision, patch: { providers: { acceptance: { api: 'openai-completions', apiKeyEnv: 'KUADE_ACCEPTANCE_KEY', baseURL: `http://127.0.0.1:${port}/v1`, models: [{ id: 'search-acceptance', contextWindow: 128000 }], defaultMaxTokens: 8192, defaultContextWindow: 128000 } } } });
      await window.kuade.call('extensions/save', { config: { mcpServers: { search: { command: uvx, args: ['--with', 'duckduckgo-mcp-server[browser]==0.7.0', 'duckduckgo-mcp-server==0.7.0'], toolCallTimeoutMs: 120000 } } } });
    }, { port, uvx: process.env.KUADE_UVX ?? 'uvx' });
    await page.reload();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.getByRole('button', { name: '工具与技能' }).click();
    await expect(page.getByRole('region', { name: '扩展运行状态' })).toContainText('3 个工具已注册', { timeout: 30000 });
    await page.getByRole('button', { name: '新任务' }).click();
    await page.getByLabel('当前模型', { exact: true }).selectOption('acceptance::search-acceptance');
    await page.getByLabel('执行模式').selectOption('auto');
    await page.getByLabel('任务需求').fill('搜索 Electron 官方 app 文档，并读取页面正文。');
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect(page.locator('.message.assistant')).toContainText('搜索调用流程结束', { timeout: 120000 });
    expect(receipts).toHaveLength(2);
    expect(String(receipts[0].content)).toMatch(/https?:\/\//);
    expect(String(receipts[0].content)).toMatch(/electron/i);
    expect(String(receipts[1].content)).toMatch(/app/i);
    expect(String(receipts[1].content).length).toBeGreaterThan(300);
    expect(receipts.some(row => /^(Error|Failed)/i.test(String(row.content)))).toBe(false);
    await page.getByRole('button', { name: '工具与技能' }).click();
    await page.getByText('search', { exact: true }).click();
    await expect(page.getByRole('region', { name: '扩展运行状态' })).toContainText('工具返回成功');
    await page.screenshot({ path: resolve(root, 'accepted.png') });
    status = 'passed';
  } finally {
    await writeFile(resolve(root, 'acceptance.json'), JSON.stringify({ status, controlledProvider: true, realSearchMcp: true, receipts }, null, 2));
    await app.close(); await new Promise<void>(done => server.close(() => done()));
    console.log('搜索集成验收：', root);
  }
});
