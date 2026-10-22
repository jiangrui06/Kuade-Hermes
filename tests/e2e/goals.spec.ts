import { test, expect, _electron as electron } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

test('持续目标复用底座：自动续轮、暂停、重启、明确恢复及完成', async () => {
  const root = resolve('.cache/goals-' + randomUUID()); await mkdir(root, { recursive: true });
  const marker = randomUUID(); const held = new Set<ServerResponse>();
  let modelRequests = 0; let finishing = false; let finishStep = 0; let readGoal: () => Promise<any>;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'goal-fixture' }] })); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); let delta: any = { content: '目标尚有后续步骤，下一轮继续。' };
    if (body.tools?.length) {
      modelRequests++;
      if (!finishing && modelRequests === 1) delta = { tool_calls: [{ index: 0, id: 'goal-plan', type: 'function', function: { name: 'todo_write', arguments: JSON.stringify({ todos: [{ content: '记录需求', status: 'completed' }, { content: '核对交付', status: 'pending' }] }) } }] };
      if (!finishing && modelRequests > 2) { held.add(response); response.on('close', () => held.delete(response)); return; }
      if (finishing) {
        const step = finishStep++;
        if (step === 0) delta = { tool_calls: [{ index: 0, id: 'goal-write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ file_path: 'goal-proof.txt', content: marker }) } }] };
        else if (step === 1) {
          const goal = await readGoal();
          delta = { tool_calls: [{ index: 0, id: 'goal-complete', type: 'function', function: { name: 'update_goal', arguments: JSON.stringify({ goal_id: goal.id, revision: goal.revision, action: 'complete' }) } }] };
        } else delta = { content: '文件已写入，目标完成。' };
      }
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const part of [{ delta: { role: 'assistant' }, finish_reason: null }, { delta, finish_reason: null }, { delta: {}, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }]) response.write('data: ' + JSON.stringify({ id: 'goal-test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, ...part }] }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const port = (server.address() as any).port;
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)), KUADE_USER_DATA: resolve(root, 'app') }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  let app = await launch(); let page = await app.firstWindow(); let sessionId = '';
  const receipt: Record<string, unknown> = { status: 'not-passed', controlledProvider: true, executablePath: executablePath ?? 'development' };
  try {
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.getByRole('button', { name: '模型连接', exact: true }).click();
    await page.getByLabel('连接名称', { exact: true }).fill('持续目标验收');
    await page.getByLabel('API 地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
    await page.getByRole('checkbox', { name: 'goal-fixture', exact: true }).check();
    await page.getByRole('button', { name: '保存连接' }).click();
    await expect(page.getByRole('status').filter({ hasText: '模型配置已保存' })).toBeVisible();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await page.getByLabel('执行模式').selectOption('auto');
    await page.getByText('设置持续目标', { exact: true }).click();
    const objective = '完成多轮任务并写入本地验收文件。\n' + '保留当前工作并核对结果。'.repeat(100);
    await page.getByLabel('持续目标要求').fill(objective);
    await page.getByLabel('自动轮数上限').fill('8');
    await page.getByRole('button', { name: '开始持续目标', exact: true }).click();
    await expect.poll(() => held.size).toBe(1);
    sessionId = await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items.find((row: any) => row.running)?.sessionId);
    expect(sessionId).toBeTruthy();
    readGoal = () => page.evaluate(id => window.kuade.call('goals/get', { agentId: id }), sessionId);
    expect((await readGoal()).roundsStarted).toBe(2);
    await expect(page.getByText('持续执行已开启', { exact: true })).toBeVisible();
    const objectiveBody = page.getByLabel('目标正文', { exact: true });
    await expect(objectiveBody).toHaveText(objective);
    expect(await objectiveBody.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await objectiveBody.focus(); await page.keyboard.press('PageDown');
    await expect.poll(() => objectiveBody.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.getByRole('button', { name: '暂停目标', exact: true }).click();
    await expect(page.getByText('目标已暂停', { exact: true })).toBeVisible();
    await expect.poll(() => held.size).toBe(0);
    const paused = await readGoal(); expect(paused.activation).toBe('disarmed');
    const requestsAtPause = modelRequests;
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
    await expect(page.getByText('目标已暂停', { exact: true })).toBeVisible();
    expect(modelRequests).toBe(requestsAtPause);
    await page.screenshot({ path: resolve(root, 'paused-after-restart.png') });
    finishing = true;
    await page.getByRole('button', { name: '恢复目标', exact: true }).click();
    await expect(page.getByText('Agent 报告目标完成', { exact: true })).toBeVisible();
    await expect.poll(async () => (await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items)).some((row: any) => row.running)).toBe(false);
    expect(await readFile(resolve(root, 'app/默认工作区/goal-proof.txt'), 'utf8')).toBe(marker);
    const completed = await readGoal(); expect(completed.phase).toBe('complete'); expect(completed.roundsStarted).toBe(3);
    expect(completed.id).toBe(paused.id);
    const progress = page.getByRole('region', { name: '任务进度' });
    await expect(progress).toContainText('本轮结束');
    await expect(progress).toContainText('计划仍有未勾选步骤');
    await expect(progress.getByRole('button', { name: '继续任务' })).toHaveCount(0);
    await page.screenshot({ path: resolve(root, 'completed.png') });
    Object.assign(receipt, { status: 'passed', sessionId, paused, completed, modelRequests });
  } finally {
    await writeFile(resolve(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    if (!page.isClosed()) await page.screenshot({ path: resolve(root, 'last-state.png') }).catch(() => {});
    await app.close(); for (const response of held) response.destroy(); server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done())); console.log('持续目标验收：', root);
  }
});
