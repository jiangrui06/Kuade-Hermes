import { test, expect, _electron as electron } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

test('长任务计划：停止、桌面重启、引擎中断后在原会话继续', async () => {
  const root = resolve('.cache/task-progress-' + randomUUID()); await mkdir(root, { recursive: true });
  let phase: 'initial' | 'continue' = 'initial'; let step = 0; let round = 1;
  const held = new Set<ServerResponse>(); const requests: any[] = [];
  const todos = (done = false) => [{ content: '创建第一份文件', status: 'completed' }, { content: '完成第二份文件', status: done ? 'completed' : 'in_progress' }];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'progress-fixture' }] })); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    let delta: any = { content: '计划验收完成' };
    if (body.tools?.length) {
      const index = step++;
      if (phase === 'initial' && index >= 2) { held.add(response); response.on('close', () => held.delete(response)); return; }
      const tool = index === 1 ? 'write' : 'todo_write';
      if (phase === 'initial' || index < 3) {
        const args = tool === 'write' ? { file_path: `${phase}-${round}.txt`, content: `${phase} durable proof` } : { todos: todos(phase === 'continue' && index === 2) };
        delta = { tool_calls: [{ index: 0, id: `plan-${round}-${phase}-${index}`, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] };
      }
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const part of [{ delta: { role: 'assistant' }, finish_reason: null }, { delta, finish_reason: null }, { delta: {}, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }]) response.write('data: ' + JSON.stringify({ id: 'plan', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, ...part }] }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as any).port;
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  let app = await launch(); let page = await app.firstWindow();
  try {
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.getByRole('button', { name: '模型连接', exact: true }).click();
    await page.getByLabel('连接名称', { exact: true }).fill('计划验收服务');
    await page.getByLabel('API 地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
    await page.getByRole('checkbox', { name: 'progress-fixture', exact: true }).check();
    await page.getByRole('button', { name: '保存连接' }).click();
    await expect(page.getByRole('status').filter({ hasText: '模型配置已保存' })).toBeVisible();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    for (round = 1; round <= 2; round++) {
      phase = 'initial'; step = 0;
      await page.getByRole('button', { name: '新任务' }).click();
      await page.getByLabel('执行模式').selectOption('auto');
      await page.getByLabel('任务需求').fill(`计划验收第 ${round} 轮：先创建文件，再继续下一步。`);
      await page.getByLabel('发送任务', { exact: true }).click();
      await expect(page.getByRole('region', { name: '任务进度' })).toContainText('计划 1 / 2');
      await expect.poll(() => held.size).toBe(1);
      expect(await readFile(resolve(root, 'app', '默认工作区', `initial-${round}.txt`), 'utf8')).toBe('initial durable proof');
      const sessionId = await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items.find((item: any) => item.running)?.sessionId);
      expect(sessionId).toBeTruthy();
      if (round === 1) {
        await page.getByLabel('停止任务', { exact: true }).click();
        await expect(page.getByRole('region', { name: '任务进度' })).toContainText('已停止');
        await app.close(); app = await launch(); page = await app.firstWindow();
        await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
        await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
        await expect(page.getByRole('region', { name: '任务进度' })).toContainText('已停止');
      } else {
        // Exiting terminates the owned runtime tree without a turn closer; cold reads repair the orphaned turn.
        await app.close(); app = await launch(); page = await app.firstWindow();
        await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
        await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
        await expect(page.getByRole('region', { name: '任务进度' })).toContainText('已中断');
      }
      await expect(page.getByRole('region', { name: '任务进度' })).toContainText('计划 1 / 2');
      await page.getByText(/查看步骤计划/).click();
      await expect(page.getByText('完成第二份文件', { exact: true })).toBeVisible();
      await page.screenshot({ path: resolve(root, `restored-${round}.png`) });
      phase = 'continue'; step = 0;
      await page.getByRole('button', { name: '继续任务', exact: true }).click();
      await expect(page.getByRole('region', { name: '任务进度' })).toContainText('本轮结束');
      await expect(page.getByRole('region', { name: '任务进度' })).toContainText('计划 2 / 2');
      await expect(page.getByRole('button', { name: '继续任务', exact: true })).toHaveCount(0);
      expect(await readFile(resolve(root, 'app', '默认工作区', `continue-${round}.txt`), 'utf8')).toBe('continue durable proof');
      const sessions = await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items.filter((item: any) => !item.blank));
      expect(sessions).toHaveLength(round);
      expect(sessions.some((item: any) => item.sessionId === sessionId)).toBe(true);
      expect(requests.some(body => body.messages.some((message: any) => message.role === 'user' && String(message.content).includes('继续当前任务')) && body.messages.some((message: any) => message.role === 'tool' && message.tool_call_id === `plan-${round}-initial-1`))).toBe(true);
      await page.screenshot({ path: resolve(root, `completed-${round}.png`) });
    }
  } finally {
    await writeFile(resolve(root, 'requests.json'), JSON.stringify(requests, null, 2));
    if (!page.isClosed()) await page.screenshot({ path: resolve(root, 'last-state.png') }).catch(() => {});
    await app.close(); for (const response of held) response.destroy(); server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    console.log('计划与继续任务验收证据：', root);
  }
});
