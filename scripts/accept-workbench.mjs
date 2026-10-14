// Explicit real-provider acceptance; uses saved credentials only inside the runtime.
import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

if (!process.env.KUADE_TEST_EXECUTABLE) throw new Error('Set KUADE_TEST_EXECUTABLE');
const evidence = resolve('.cache/real-workbench-' + randomUUID()); await mkdir(evidence, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.KUADE_USER_DATA;
const app = await electron.launch({ executablePath: process.env.KUADE_TEST_EXECUTABLE, args: [], env });
let sessionId; let page; let stage = 'starting';
try {
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  const defaultWorkspace = await page.evaluate(async () => (await window.kuade.call('workspace/default')).workspace);
  await page.getByLabel('当前项目', { exact: true }).selectOption(defaultWorkspace.workspaceId);
  stage = 'model-catalog';
  await expect(page.getByLabel('当前模型', { exact: true }).locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型', { exact: true }).locator('option').evaluateAll(options => options.map(option => ({ value: option.value, name: option.textContent })));
  const selected = options.find(option => option.value.endsWith('::kimi-k3'));
  if (!selected || options.some(option => option.value.startsWith('deepseek::'))) throw new Error('Unexpected product catalog');
  const alternate = options.find(option => option.value.endsWith('::kimi-k2.6'));
  if (alternate) {
    await page.getByLabel('当前模型', { exact: true }).selectOption(alternate.value);
    await expect(page.getByLabel('发送任务', { exact: true })).toBeDisabled(); // Empty prompt stays unsent.
  }
  await page.getByLabel('当前模型', { exact: true }).selectOption(selected.value);
  await expect(page.getByLabel('思考强度')).toBeVisible({ timeout: 60000 });
  const efforts = await page.getByLabel('思考强度').locator('option').evaluateAll(options => options.map(option => option.value));
  if (!['off', 'low', 'high', 'max'].every(value => efforts.includes(value))) throw new Error('Expected model-reported efforts absent');
  await page.getByLabel('思考强度').selectOption('low');
  await page.getByLabel('执行模式').selectOption('auto');
  const file = 'kuade-acceptance-' + randomUUID() + '.txt';
  const previousIds = await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items.map(item => item.sessionId));
  await page.getByLabel('任务需求').fill(`这是默认工作区验收。只在当前工作区创建 ${file}，内容精确为 Kuade default workspace accepted。写入后读取确认，最后回复“默认工作区验收完成”。不要修改其他文件或安装依赖。`);
  stage = 'real-task';
  await page.getByLabel('发送任务', { exact: true }).click();
  stage = 'waiting-for-task';
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(async ({path, previousIds}) => {
      const tasks = (await window.kuade.call('session/list', { _request: {} })).items;
      const task = tasks.find(item => item.cwd === path && !item.blank && !previousIds.includes(item.sessionId));
      return task ? { sessionId: task.sessionId, running: task.running, updatedAt: task.updatedAt } : null;
    }, { path: defaultWorkspace.path, previousIds });
    if (state) { sessionId = state.sessionId; if (!state.running) break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  const content = await readFile(join(defaultWorkspace.path, file), 'utf8');
  if (content.trim() !== 'Kuade default workspace accepted') throw new Error('File verification failed');
  stage = 'verifying-completion';
  await expect(page.getByLabel('当前模型', { exact: true })).toBeEnabled({ timeout: 30000 });
  await expect(page.getByLabel('思考强度')).toHaveValue('low');
  await page.screenshot({ path: resolve(evidence, 'accepted.png') });
  // Leave the user's familiar model with the provider's default reasoning setting.
  stage = 'restoring-user-controls';
  await page.getByRole('button', { name: '新任务' }).click();
  await page.getByLabel('思考强度').selectOption('');
  await writeFile(resolve(evidence, 'acceptance.json'), JSON.stringify({ status: 'passed', modelCount: options.length, efforts, defaultWorkspace: defaultWorkspace.path, file, sessionId, model: selected.name, effort: 'low', alternateSelectable: !!alternate, fileVerified: true, userControlsRestored: true }, null, 2));
  console.log(JSON.stringify({ status: 'passed', modelCount: options.length, efforts, evidence, defaultWorkspace: defaultWorkspace.path }));
} catch (error) {
  console.error(JSON.stringify({ status: 'not-passed', stage, error: error.code ?? error.name, evidence })); process.exitCode = 1;
  console.error(String(error.message).slice(0, 1200));
  await page?.screenshot({ path: resolve(evidence, 'last-state.png') }).catch(() => {});
} finally {
  if (sessionId) await page?.evaluate(async sessionId => window.kuade.call('session/cancel', { request: { sessionId } }), sessionId).catch(() => {});
  await app.close();
}
