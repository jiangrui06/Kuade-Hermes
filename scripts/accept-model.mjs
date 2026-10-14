// Explicitly invoked real-provider acceptance. Never part of automatic npm tests.
import { _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

if (!process.env.KUADE_TEST_EXECUTABLE) throw new Error('Set KUADE_TEST_EXECUTABLE to the accepted desktop build');
const root = resolve('.cache/real-model-' + randomUUID());
await mkdir(root, { recursive: true });
await writeFile(resolve(root, 'README.md'), '# Kuade model acceptance\nUse only this disposable project. No dependency installation is needed.\n');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.KUADE_USER_DATA;
const app = await electron.launch({ executablePath: process.env.KUADE_TEST_EXECUTABLE, args: [], env });
let page;
let sessionId;
let stage = 'loading-desktop';
try {
  page = await app.firstWindow();
  await page.waitForURL('kuade://app/index.html');
  await page.getByText('本机运行', { exact: true }).waitFor({ state: 'visible', timeout: 130000 });
  stage = 'reading-model-metadata';
  console.log(JSON.stringify({ stage, userData: await app.evaluate(({ app }) => app.getPath('userData')) }));
  const providers = await page.evaluate(async () => {
    const settings = await window.kuade.call('settings/describe');
    const configured = settings.namespaces.find(ns => ns.ns === 'llm-pi-ai')?.value?.providers ?? {};
    return Object.entries(configured).filter(([id, p]) => id.startsWith('kuade-') || p.apiKeyEnv?.startsWith('KUADE_')).map(([id, p]) => ({ id, name: p.displayName, models: p.models?.map(m => m.id) ?? [] }));
  });
  if (!providers.length) console.log(JSON.stringify(await page.evaluate(async () => {
    const settings = await window.kuade.call('settings/describe');
    const ns = settings.namespaces.find(ns => ns.ns === 'llm-pi-ai');
    return { stage: 'model-shape', fields: Object.keys(ns?.value ?? {}), providers: Object.entries(ns?.value?.providers ?? {}).map(([id, p]) => ({ id, fields: Object.keys(p), models: p.models?.map(m => m.id) ?? [] })) };
  })));
  console.log(JSON.stringify({ stage: 'saved-connections', count: providers.length, models: providers.map(provider => provider.models) }));
  if (providers.length !== 1 || !providers[0].models.length) throw new Error(`Choose a model connection first; found ${providers.length} custom connections`);
  const provider = providers[0];
  const model = provider.models[0];
  stage = 'discovering-provider-models';
  await page.getByRole('button', { name: '模型连接', exact: true }).click();
  await page.locator('.provider-item').filter({ hasText: provider.name }).click();
  await page.getByRole('group', { name: '可选模型' }).waitFor({ state: 'visible', timeout: 65000 });
  const discoveryCount = await page.getByRole('group', { name: '可选模型' }).getByRole('checkbox').count();
  const selectedModelListed = await page.getByRole('checkbox', { name: model, exact: true }).count() > 0;
  console.log(JSON.stringify({ stage: 'provider-discovery-passed', count: discoveryCount, selectedModelListed }));
  await writeFile(resolve(root, 'discovery.json'), JSON.stringify({ status: 'passed', provider: provider.name, count: discoveryCount, selectedModelListed }, null, 2));
  await page.screenshot({ path: resolve(root, 'discovered-models.png') });
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  stage = 'opening-test-project';
  console.log(JSON.stringify({ stage: 'configured-provider', name: provider.name, model, project: root }));
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, root);
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await page.getByLabel('当前模型').selectOption(`${provider.id}::${model}`);
  await page.getByLabel('执行模式').selectOption('auto');
  await page.getByLabel('任务需求').fill('这是 Kuade 真实模型验收。仅在当前临时项目内操作，不安装依赖、不访问其他目录。创建 sum.mjs，导出 sum(values)：数组中的有限数字相加，空数组返回 0，非数组或任一元素不是有限数字时抛出 TypeError。创建 sum.test.mjs，使用 node:test 覆盖正常、空数组、负数和无效输入。实际运行 node --test sum.test.mjs，修复问题直到通过，再用中文报告结果。请直接完成，不需要额外询问。');
  await page.getByLabel('发送任务', { exact: true }).click();
  stage = 'running-model-task';
  await page.locator('.message.user').first().waitFor({ state: 'visible', timeout: 30000 });
  const deadline = Date.now() + 8 * 60_000;
  let finished = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(async root => {
      const rows = (await window.kuade.call('session/list', { _request: {} })).items;
      const task = rows.find(item => item.cwd === root && !item.blank);
      return task ? { sessionId: task.sessionId, running: task.running } : null;
    }, root);
    if (state) { sessionId = state.sessionId; if (!state.running) { finished = true; break; } }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!finished) throw new Error('Real-model task did not finish within the acceptance time limit');
  await readFile(resolve(root, 'sum.mjs'), 'utf8');
  await readFile(resolve(root, 'sum.test.mjs'), 'utf8');
  const exec = promisify(execFile);
  await exec(process.execPath, ['--test', 'sum.test.mjs'], { cwd: root, windowsHide: true, timeout: 30000 });
  const verification = "import assert from 'node:assert/strict'; import {sum} from './sum.mjs'; assert.equal(sum([1,2,3]),6); assert.equal(sum([]),0); assert.equal(sum([-3,1]),-2); for(const value of [null, '12', [1,'2'],[Infinity],[NaN]]) assert.throws(()=>sum(value),TypeError);";
  await exec(process.execPath, ['--input-type=module', '-e', verification], { cwd: root, windowsHide: true, timeout: 30000 });
  await page.screenshot({ path: resolve(root, 'accepted.png') });
  await writeFile(resolve(root, 'acceptance.json'), JSON.stringify({ status: 'passed', provider: provider.name, model, discoveryCount, selectedModelListed, sessionId, taskTestsPassed: true, independentChecksPassed: true }, null, 2));
  console.log(JSON.stringify({ stage: 'passed', project: root, model }));
} catch (error) {
  // Avoid dumping provider responses or potentially sensitive configuration.
  console.error('Real-model acceptance did not pass: ' + stage + ': ' + (error.code ?? error.name));
  if (stage === 'discovering-provider-models') console.error(await page.locator('.model-discovery-status').textContent().catch(() => 'Discovery UI unavailable'));
  if (stage === 'loading-desktop' || stage === 'reading-model-metadata') console.error(String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 500));
  console.error('Evidence project: ' + root);
  process.exitCode = 1;
} finally {
  if (sessionId) await page?.evaluate(async sessionId => window.kuade.call('session/cancel', { request: { sessionId } }), sessionId).catch(() => {});
  await app.close();
}
