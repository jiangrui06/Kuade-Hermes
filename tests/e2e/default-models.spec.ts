import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

test('默认工作区直接执行、完整模型切换、思考参数和重启恢复', async () => {
  const root = resolve('.cache/default-models-' + randomUUID()); await mkdir(root, { recursive: true });
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'favorite' }, { id: 'reasoner' }, { id: 'unselected' }] })); return; }
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); requests.push(input);
    const hasResult = input.messages.some((item: any) => item.role === 'tool');
    const tool = input.tools?.find((item: any) => item.function?.name === 'write');
    const delta = !hasResult && tool ? { tool_calls: [{ index: 0, id: 'fixture-write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ file_path: 'default-proof.txt', content: 'default workspace works' }) } }] } : { content: '默认工作区验收完成' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const part of [{ delta: { role: 'assistant' }, finish_reason: null }, { delta, finish_reason: null }, { delta: {}, finish_reason: 'tool_calls' in delta ? 'tool_calls' : 'stop' }]) response.write('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, ...part }] }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as any).port;
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => { throw new Error('默认任务不应打开目录选择器'); }; });
    await expect(page.getByLabel('当前项目')).toContainText('默认工作区');
    await expect(page.getByLabel('当前模型')).toHaveCount(0);
    await page.getByRole('button', { name: '模型连接', exact: true }).click();
    await page.getByLabel('连接名称', { exact: true }).fill('完整列表服务');
    await page.getByLabel('API 地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
    await page.getByRole('checkbox', { name: 'favorite', exact: true }).check();
    await page.getByRole('button', { name: '保存连接' }).click();
    await expect(page.getByRole('status').filter({ hasText: '模型配置已保存' })).toBeVisible();
    // A declared gateway capability is supplied through the real upstream settings API.
    await page.evaluate(async () => {
      const ns = (await window.kuade.call('settings/describe')).namespaces.find((ns: any) => ns.ns === 'llm-pi-ai');
      const [id, p]: any = Object.entries(ns.value.providers)[0];
      await window.kuade.call('settings/update', { ns: ns.ns, expectedRevision: ns.revision, patch: { providers: { [id]: { ...p, models: [...p.models, { id: 'reasoner', reasoningEfforts: { off: 'none', low: 'low', high: 'high' }, compat: { supportsReasoningEffort: true } }] } } } });
    });
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByRole('button', { name: '刷新模型列表' }).click();
    await expect(page.getByLabel('当前模型').locator('option')).toHaveCount(3);
    await page.getByLabel('当前模型').selectOption({ label: 'unselected' });
    await expect(page.getByLabel('思考强度')).toHaveCount(0);
    await page.getByLabel('执行模式').selectOption('auto');
    await page.getByLabel('任务需求').fill('在默认工作区写文件。');
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect(page.locator('.message.assistant')).toContainText('默认工作区验收完成');
    expect(requests[0].model).toBe('unselected');
    const systemPrompt = requests[0].messages.filter((item: any) => item.role === 'system').map((item: any) => item.content).join('\n');
    expect(systemPrompt).toContain('Kuade Harness');
    expect(systemPrompt).not.toContain('DeepSeek Harness');
    expect(await app.evaluate(({ app }) => app.getName())).toBe('Kuade Harness');
    await expect(page).toHaveTitle('Kuade Harness');
    expect(requests[0].reasoning_effort).toBeUndefined();
    expect(await readFile(resolve(root, 'app', '默认工作区', 'default-proof.txt'), 'utf8')).toBe('default workspace works');
    await expect(page.getByLabel('当前模型')).toBeEnabled();
    await page.getByLabel('当前模型').selectOption({ label: 'reasoner' });
    await page.getByLabel('思考强度').selectOption('high');
    await page.getByLabel('任务需求').fill('以高思考强度继续。');
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect.poll(() => requests.some(item => item.model === 'reasoner' && item.reasoning_effort === 'high')).toBe(true);
    await expect(page.getByLabel('当前模型')).toBeEnabled();
    await page.getByLabel('思考强度').selectOption('off');
    await page.getByLabel('任务需求').fill('关闭思考继续。');
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect.poll(() => requests.some(item => item.model === 'reasoner' && item.reasoning_effort === 'none')).toBe(true);
    await expect(page.getByLabel('当前模型')).toBeEnabled();
    await page.screenshot({ path: resolve(root, 'controls.png') });
    await page.getByRole('button', { name: /任务记录/ }).click();
    await page.getByRole('button', { name: /^重命名 / }).click();
    await page.getByLabel('任务名称', { exact: true }).fill('项目甲 · 发布验收');
    await page.getByLabel('任务名称', { exact: true }).press('Enter');
    await expect(page.getByRole('status')).toContainText('已重命名为「项目甲 · 发布验收」');
    await page.getByLabel('搜索任务').fill('默认工作区');
    await expect(page.locator('.task-record')).toHaveCount(1);
    await page.getByLabel('搜索任务').fill('不存在的名称');
    await expect(page.getByText('没有匹配的任务')).toBeVisible();
    await page.getByLabel('搜索任务').fill('发布验收');
    await page.getByLabel('筛选任务').selectOption('running');
    await expect(page.locator('.task-record')).toHaveCount(0);
    await page.getByLabel('筛选任务').selectOption('all');
    await expect(page.locator('.task-record')).toHaveCount(1);
    await page.screenshot({ path: resolve(root, 'task-records.png') });
    const workspaceId = await page.getByLabel('当前项目').inputValue();
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await expect(page.getByLabel('当前项目')).toHaveValue(workspaceId);
    await expect(page.getByLabel('当前项目').locator('option')).toHaveCount(1);
    await expect(page.getByLabel('当前模型').locator('option')).toHaveCount(3);
    await expect(page.getByLabel('思考强度')).toHaveValue('off');
    await expect(page.locator('.recent-task').first()).toContainText('项目甲 · 发布验收');
    await page.locator('.recent-task').first().click();
    await expect(page.locator('.conversation-heading h2')).toHaveText('项目甲 · 发布验收');
    await expect(page.locator('.message.assistant').last()).toContainText('默认工作区验收完成');
    const beforeRestartPrompt = requests.length;
    await page.getByLabel('任务需求').fill('重启后继续验收品牌。');
    await page.getByLabel('发送任务', { exact: true }).click();
    await expect.poll(() => requests.length).toBeGreaterThan(beforeRestartPrompt);
    await expect(page.getByLabel('当前模型')).toBeEnabled();
    for (const request of requests.filter(item => item.tools?.length)) {
      // Reasoning-model adapters may use the developer role for system instructions.
      const system = request.messages.filter((message: any) => ['system', 'developer'].includes(message.role)).map((message: any) => message.content).join('\n');
      expect(system).toContain('Kuade Harness'); expect(system).not.toContain('DeepSeek Harness');
    }
    console.log('默认工作区与模型切换证据：', root);
  } finally { await writeFile(resolve(root, 'requests.json'), JSON.stringify(requests, null, 2)); await app.close(); await new Promise<void>(done => server.close(() => done())); }
});
