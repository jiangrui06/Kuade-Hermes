import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

test('电脑控制：Kuade 通过 qwen_computer 观察、输入中文并点击验收', async () => {
  test.skip(process.env.KUADE_LIVE_COMPUTER !== '1', 'Requires explicit physical desktop acceptance');
  test.setTimeout(180000);
  const root = resolve('.cache/live-computer-' + randomUUID()); await mkdir(root, { recursive: true });
  const title = 'Kuade fixture ' + randomUUID().slice(0, 8);
  const marker = 'Kuade 中文电脑控制 ' + randomUUID().slice(0, 8);
  const resultPath = resolve(root, 'input.txt'); const readyPath = resolve(root, 'ready.txt');
  const fixture = spawn('powershell.exe', ['-NoProfile', '-STA', '-File', resolve('tests/fixtures/computer-window.ps1'), '-ResultPath', resultPath, '-WindowTitle', title, '-ReadyPath', readyPath], { windowsHide: true, stdio: 'ignore' });
  const receipts: any[] = [];
  let providerError = '';
  let imageObserved = false;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'computer-acceptance' }] })); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    if (body.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part.type === 'image_url'))) imageObserved = true;
    // Upstream title generation also uses the selected provider but has no tools.
    if (!body.tools?.length) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end('data: ' + JSON.stringify({ id: 'title', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: 'Computer acceptance' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n'); return;
    }
    const results = body.messages.filter((item: any) => item.role === 'tool');
    receipts.push(...results.filter((item: any) => !receipts.some(row => row.tool_call_id === item.tool_call_id)));
    let tool: { name: string; arguments: Record<string, unknown> } | undefined;
    try {
      if (!results.length) tool = { name: 'get_app_state', arguments: { app: String(fixture.pid) } };
      else {
        const state = String(results.at(-1).content);
        const app = state.match(/Observed target: (window:\d+:\d+)\./)?.[1];
        if (!app?.startsWith(`window:${fixture.pid}:`) || !state.includes(title)) throw new Error('工具未返回测试窗口身份');
        const index = (label: string) => {
          const match = state.split('\n').find(line => line.includes(label) && /^\s*\d+\s/.test(line))?.match(/^\s*(\d+)\s/);
          if (!match) throw new Error('当前观察缺少控件：' + label); return match[1];
        };
        if (results.length === 1) tool = { name: 'click', arguments: { app, element_index: index('Acceptance input') } };
        if (results.length === 2) tool = { name: 'type_text', arguments: { app, text: marker } };
        if (results.length === 3) {
          if (!state.includes(marker)) throw new Error('输入结果未出现');
          tool = { name: 'click', arguments: { app, element_index: index('Verify input') } };
        }
        if (results.length === 4 && !state.includes('Accepted: ' + marker)) throw new Error('窗口结果未通过');
      }
      if (tool && !body.tools.some((row: any) => row.function?.name === 'mcp__qwen_computer__' + tool!.name)) throw new Error('模型缺少目标工具');
    } catch (error) { providerError = (error as Error).message; tool = undefined; }
    const delta = tool ? { tool_calls: [{ index: 0, id: 'computer-' + results.length, type: 'function', function: { name: 'mcp__qwen_computer__' + tool.name, arguments: JSON.stringify(tool.arguments) } }] } : { content: providerError || '电脑控制流程结束。' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [{ delta: { role: 'assistant' }, finish_reason: null }, { delta, finish_reason: null }, { delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }]) response.write('data: ' + JSON.stringify({ id: 'computer', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, ...choice }] }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: resolve('.'), env });
  let status = 'not-passed';
  try {
    await expect.poll(() => readFile(readyPath, 'utf8').catch(() => ''), { timeout: 20000 }).toBe(String(fixture.pid));
    const page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.evaluate(async port => {
      const ns = (await window.kuade.call('settings/describe')).namespaces.find((item: any) => item.ns === 'llm-pi-ai');
      await window.kuade.call('credentials/set', { ref: 'KUADE_ACCEPTANCE_KEY', value: 'fixture-only' });
      await window.kuade.call('settings/update', { ns: ns.ns, expectedRevision: ns.revision, patch: { providers: { acceptance: { api: 'openai-completions', apiKeyEnv: 'KUADE_ACCEPTANCE_KEY', baseURL: `http://127.0.0.1:${port}/v1`, models: [{ id: 'computer-acceptance', input: ['text', 'image'], contextWindow: 128000 }], defaultMaxTokens: 8192, defaultContextWindow: 128000 } } } });
    }, port);
    await page.reload();
    await page.getByRole('button', { name: '工具与技能' }).click();
    await page.getByRole('button', { name: '添加电脑控制' }).click();
    await expect(page.getByLabel('MCP 配置')).toHaveValue(/qwen_computer/);
    await page.getByRole('button', { name: '保存并重新加载' }).click();
    await expect(page.getByRole('region', { name: '扩展运行状态' })).toContainText('9 个工具已注册', { timeout: 45000 });
    await page.getByRole('button', { name: '新任务' }).click();
    await page.getByLabel('当前模型', { exact: true }).selectOption('acceptance::computer-acceptance');
    await page.getByLabel('执行模式').selectOption('auto');
    await page.getByLabel('任务需求').fill(`仅控制进程 ${fixture.pid} 的 ${title} 测试窗口，输入 ${marker} 并点击 Verify input。`);
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect(page.locator('.message.assistant')).toContainText('电脑控制流程结束。', { timeout: 60000 });
    expect(providerError).toBe(''); expect(receipts).toHaveLength(4);
    expect(imageObserved).toBe(true);
    expect(await readFile(resultPath, 'utf8')).toBe(marker);
    await page.getByRole('button', { name: '工具与技能' }).click();
    await page.getByText('qwen_computer', { exact: true }).click();
    await expect(page.getByRole('region', { name: '扩展运行状态' })).toContainText('工具返回成功');
    await page.screenshot({ path: resolve(root, 'accepted.png') }); status = 'passed';
  } finally {
    await writeFile(resolve(root, 'acceptance.json'), JSON.stringify({ status, controlledProvider: true, realDesktopInput: true, imageObserved, marker, fixturePid: fixture.pid, providerError, receipts }, null, 2));
    await app.close(); if (fixture.pid && fixture.exitCode === null) fixture.kill();
    await new Promise<void>(done => server.close(() => done()));
    console.log('电脑控制集成验收：', root);
  }
});
