// Opt-in UI journey with the user's configured provider. No simulated model responses.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { startProjectServer } from './acceptance/project-manager-verify.mjs';
import assert from 'node:assert/strict';
const { _electron: electron, chromium, expect } = createRequire(resolve('package.json'))('@playwright/test');
if (process.env.KUADE_REAL_JOURNEY !== '1' || !process.env.KUADE_MODEL_PROFILE) throw new Error('Explicit real-model opt-in and profile required');
const root = join(process.env.KUADE_ACCEPT_ROOT ?? 'D:/Kuade-acceptance', 'real-user-journey-' + randomUUID());
const project = join(root, '报价计算器'), profile = join(root, 'app');
await mkdir(project, { recursive: true }); await mkdir(join(profile, 'harness/profiles/web'), { recursive: true });
const credentialNames = ['harness/.credentials.yaml', 'harness/profiles/web/cordis.patch.yml'];
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const originalHashes = await Promise.all(credentialNames.map(file => hash(join(process.env.KUADE_MODEL_PROFILE, file))));
const receipt = { status: 'running', realProvider: true, root, project, startedAt: new Date().toISOString(), checks: [], turns: [], observations: [] };
const files = {
  'package.json': JSON.stringify({ name: 'quote-demo', private: true, type: 'module', scripts: { test: 'node --test', start: 'node server.mjs' } }, null, 2),
  'pricing.js': 'export function quote(price, quantity) { return Math.round(price * quantity * 100) / 100; }\n',
  'pricing.test.js': "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { quote } from './pricing.js'; test('基础报价', () => assert.equal(quote(12.5, 2), 25));\n",
  'index.html': '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>报价计算器</title><style>body{font:16px system-ui;max-width:600px;margin:60px auto}label{display:block;margin:18px 0}input{padding:8px}output{font-size:28px}</style><h1>报价计算器</h1><form><label>单价<input aria-label="单价" type="number" min="0" step="0.01" value="100"></label><label>数量<input aria-label="数量" type="number" min="1" value="1"></label><button>计算报价</button></form><p>合计：<output aria-label="合计">100.00</output></p><script type="module">import {quote} from "./pricing.js";document.querySelector("form").onsubmit=e=>{e.preventDefault();document.querySelector("output").textContent=quote(+document.querySelector("[aria-label=单价]").value,+document.querySelector("[aria-label=数量]").value).toFixed(2)};</script></html>',
  'server.mjs': "import {createServer} from 'node:http'; import {readFile} from 'node:fs/promises'; const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1); if(!['index.html','pricing.js'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(await readFile(new URL(name,import.meta.url)));}catch{res.writeHead(500);res.end();}}); server.listen(Number(process.env.PORT ?? 5178),'127.0.0.1',()=>{console.log(JSON.stringify({port:server.address().port}));console.log('http://127.0.0.1:'+server.address().port)});\n",
};
for (const [name, contents] of Object.entries(files)) await writeFile(join(project, name), contents);
execFileSync('git', ['init', project], { windowsHide: true, stdio: 'ignore' });
execFileSync('git', ['-C', project, 'config', 'core.autocrlf', 'false'], { windowsHide: true });
execFileSync('git', ['-C', project, 'add', '.'], { windowsHide: true });
let app, page, browser, server, sessionId, stage = 'launch';
const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
const capture = async name => {
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.restore(); w.show(); w.focus(); });
  await page.bringToFront();
  await page.screenshot({ path: join(root, name + '.png'), timeout: 15000 });
};
async function runTurn(prompt, afterSeq = -1) {
  await page.getByLabel('任务需求', { exact: true }).fill(prompt);
  await page.getByLabel('发送任务', { exact: true }).click();
  const deadline = Date.now() + 15 * 60000; let nextLog = 0;
  while (Date.now() < deadline) {
    const task = (await call('session/list', { _request: {} })).items.find(row => row.cwd === project && !row.blank);
    if (task) {
      sessionId = task.sessionId;
      const projection = await call('session/projections', { request: { sessionId } });
      const history = await call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 100 } });
      const end = history.records.findLast(row => row.event.type === 'turn/end');
      if (!task.running && end?.event.seq > afterSeq) {
        await writeFile(join(root, `history-${receipt.turns.length + 1}.json`), JSON.stringify(history, null, 2));
        receipt.turns.push({ endSeq: end.event.seq, reason: end.event.data.reason.kind });
        if (end.event.data.reason.kind !== 'completed') { const error = new Error('Model turn ended before acceptance completion: ' + end.event.data.reason.kind); error.code = 'MODEL_TURN_INCOMPLETE'; throw error; }
        return end.event.seq;
      }
    }
    if (Date.now() > nextLog) { console.log(JSON.stringify({ stage, root, sessionId })); nextLog = Date.now() + 30000; }
    await new Promise(done => setTimeout(done, 1500));
  }
  const error = new Error('Observation budget reached; incomplete'); error.code = 'OBSERVATION_LIMIT'; throw error;
}
try {
  for (const file of credentialNames) await copyFile(join(process.env.KUADE_MODEL_PROFILE, file), join(profile, file));
  const env = { ...process.env, KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE;
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: executablePath ? project : resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  receipt.application = await call('app/info'); receipt.executable = executablePath ?? 'development Electron';
  if (executablePath) { receipt.executableSha256 = await hash(executablePath); receipt.appArchiveSha256 = await hash(resolve(executablePath, '../resources/app.asar')); }
  // Only the OS folder picker is supplied a deterministic path. The actual Open project handler runs normally.
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await expect(page.getByLabel('当前项目').locator('option:checked')).toHaveText('报价计算器');
  await page.getByRole('button', { name: '新任务' }).click();
  await expect(page.getByLabel('当前模型').locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型').locator('option').evaluateAll(rows => rows.map(row => ({ value: row.value, label: row.textContent })));
  receipt.model = options.find(row => row.value.endsWith('::' + (process.env.KUADE_ACCEPT_MODEL ?? 'kimi-k3')))?.value ?? options.find(row => row.value)?.value;
  assert.ok(receipt.model, 'Configured provider must have a model');
  await page.getByLabel('当前模型').selectOption(receipt.model);
  if (await page.getByLabel('思考强度').isVisible()) await page.getByLabel('思考强度').selectOption('low');
  await page.getByLabel('执行模式').selectOption('auto');
  await capture('01-new-task'); receipt.checks.push('Open project and new task using configured model through UI');
  stage = 'real-model-edit';
  const endSeq = await runTurn('请完善这个报价计算器：新增“优惠比例 (%)”输入框（默认 0），quote(price, quantity, discount=0) 接收 0 到 100 的优惠百分比，合计四舍五入到两位小数。对负数单价、非正整数数量、超范围优惠和非有限数值抛出错误，页面显示中文提示。保留已有入口与 aria-label，给新输入设置 aria-label="优惠比例"。添加覆盖边界的 Node 测试并实际运行 npm test，新增 README.md（简体）、README.zh-TW.md、README.en.md 说明启动与用法。仅修改当前项目，不提交 Git，不安装依赖，不启动持续服务器。完成后用简短中文告诉我改了哪些文件、测试结果和查看方式。');
  await capture('02-reply');
  await page.getByRole('button', { name: '查看修改', exact: true }).click();
  await expect(page.locator('.diff-view')).toBeVisible();
  await capture('03-changes');
  receipt.diff = await call('git/changes', { sessionId });
  receipt.observations.push({ newReadmeInList: await page.getByText('README.md', { exact: true }).count(), readmeReviewButtons: await page.getByRole('button', { name: /查看 README.md/ }).count() });
  if (process.env.KUADE_EXPECT_REVIEW === '1') {
    await page.getByRole('button', { name: '查看 README.md', exact: true }).click();
    await expect(page.locator('.new-file-preview')).toContainText('npm');
    await capture('03-new-file-preview');
    await page.getByRole('button', { name: '查看 pricing.js', exact: true }).click();
    await expect(page.locator('.diff-view')).toContainText('discount');
    await capture('03-file-diff');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture('03-narrow-review');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
    await page.getByRole('button', { name: '回到任务继续修改', exact: true }).click();
    await expect(page.getByLabel('任务需求')).toBeVisible();
    receipt.checks.push('New-file preview, per-file Diff, narrow-window review and return to task');
  }
  receipt.checks.push('Review actual modified files in Changes');
  stage = 'history-followup';
  await page.getByRole('button', { name: '任务记录', exact: true }).click();
  await page.getByRole('button', { name: /^重命名 / }).first().click();
  await page.getByLabel('任务名称', { exact: true }).fill('报价计算器 · 优惠与重置');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.getByLabel('搜索任务').fill('优惠与重置');
  await expect(page.locator('.task-record')).toHaveCount(1);
  await capture('04-task-history');
  await page.locator(`.task-row[data-session-id="${sessionId}"]`).click();
  await runTurn('继续完善刚才的计算器：添加“重置”按钮，点击后单价恢复 100、数量 1、优惠比例 0，合计恢复 100.00，清除页面错误。保留优惠与校验行为，再运行测试并更新三个版本的 README。另请检查启动说明：页面使用 ES module，应通过 npm start 的 HTTP 服务访问，不应建议直接双击 HTML。仍只修改当前项目，不提交 Git、不启动持续服务器。', endSeq);
  await capture('05-followup'); receipt.checks.push('Rename, search, reopen same task and real-model follow-up');
  if (process.env.KUADE_EXPECT_PREVIEW_LINK === '1') {
    // Exercise real renderer -> main-process dispatch, with only the OS opener stubbed.
    await app.evaluate(({ shell }) => { (globalThis).journeyLinks = []; shell.openExternal = async url => { (globalThis).journeyLinks.push(url); }; });
    await page.locator('.message.assistant a[href="http://127.0.0.1:5178/"]').last().click();
    assert.deepEqual(await app.evaluate(() => (globalThis).journeyLinks), ['http://127.0.0.1:5178/']);
    receipt.checks.push('Preview address in real model reply dispatches through main process; OS opener stubbed');
  }
  stage = 'independent-code-verification';
  const { quote } = await import(new URL('file:///' + join(project, 'pricing.js').replaceAll('\\', '/')));
  assert.equal(quote(100, 2, 15), 170); assert.equal(quote(19.99, 3, 10), 53.97); assert.equal(quote(10, 1, 100), 0); assert.equal(quote(12.5, 2), 25);
  for (const args of [[-1, 1, 0], [1, 0, 0], [1, 1.5, 0], [1, 1, 101], [1, 1, -1], [Infinity, 1, 0], [1, NaN, 0], [1, 1, NaN]]) assert.throws(() => quote(...args));
  const testLog = execFileSync(process.execPath, ['--test'], { cwd: project, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  receipt.generatedTestCount = Number(testLog.match(/# tests (\d+)/)?.[1]);
  assert.ok(receipt.generatedTestCount > 0, 'The generated test suite must actually execute tests');
  await writeFile(join(root, 'independent-tests.txt'), testLog);
  for (const name of ['README.md', 'README.zh-TW.md', 'README.en.md']) assert.ok((await readFile(join(project, name), 'utf8')).length > 60);
  receipt.checks.push('Independent decimal, default, full-discount and eight invalid-input assertions; rerun generated Node tests');
  stage = 'independent-browser-verification';
  server = await startProjectServer(project, join(root, 'unused.sqlite'), join(root, 'preview-server.log'));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const preview = await browser.newPage(); await preview.goto(server.url);
  await preview.getByLabel('单价', { exact: true }).fill('19.99'); await preview.getByLabel('数量', { exact: true }).fill('3'); await preview.getByLabel('优惠比例', { exact: true }).fill('10');
  await preview.getByRole('button', { name: '计算报价', exact: true }).click();
  await expect(preview.getByLabel('合计', { exact: true })).toHaveText('53.97');
  await preview.screenshot({ path: join(root, '06-result.png') });
  await preview.getByRole('button', { name: '重置', exact: true }).click();
  await expect(preview.getByLabel('单价', { exact: true })).toHaveValue('100'); await expect(preview.getByLabel('数量', { exact: true })).toHaveValue('1'); await expect(preview.getByLabel('优惠比例', { exact: true })).toHaveValue('0'); await expect(preview.getByLabel('合计', { exact: true })).toHaveText('100.00');
  receipt.checks.push('Generated application in real Edge: discounted total and reset');
  stage = 'restart-history';
  await app.close(); app = undefined;
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: executablePath ? project : resolve('.'), env }); page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  await page.getByRole('button', { name: '任务记录', exact: true }).click();
  await page.getByLabel('搜索任务').fill('优惠与重置');
  await page.locator(`.task-row[data-session-id="${sessionId}"]`).click();
  await expect(page.locator('.message.assistant').last()).toBeVisible();
  await expect(page.getByLabel('当前模型')).toHaveValue(receipt.model, { timeout: 60000 });
  await page.getByLabel('任务需求').fill('检查重启后是否可以继续输入');
  await expect(page.getByLabel('发送任务', { exact: true })).toBeEnabled();
  await page.getByLabel('任务需求').fill('');
  await capture('07-reopened'); receipt.checks.push('Application restart preserves task title and conversation');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = ['OBSERVATION_LIMIT', 'MODEL_TURN_INCOMPLETE'].includes(error.code) ? 'incomplete' : 'not-passed';
  receipt.error = { stage, message: error.message.slice(0, 2000) };
  if (page && !page.isClosed()) await capture('failure').catch(() => {});
} finally {
  const closed = await Promise.allSettled([browser?.close(), server?.stop(), app?.close()]);
  receipt.teardownErrors = closed.filter(result => result.status === 'rejected').map(result => String(result.reason?.message ?? result.reason).slice(0, 500));
  const removed = await Promise.allSettled(credentialNames.map(file => rm(join(profile, file), { force: true })));
  receipt.temporaryCredentialsRemoved = removed.every(result => result.status === 'fulfilled');
  if (receipt.teardownErrors.length || !receipt.temporaryCredentialsRemoved) receipt.status = 'not-passed';
  receipt.originalSettingsUnchanged = JSON.stringify(originalHashes) === JSON.stringify(await Promise.all(credentialNames.map(file => hash(join(process.env.KUADE_MODEL_PROFILE, file)))));
  if (!receipt.originalSettingsUnchanged) receipt.status = 'not-passed';
  receipt.finishedAt = new Date().toISOString(); receipt.sessionId = sessionId;
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, root, model: receipt.model, checks: receipt.checks, observations: receipt.observations, error: receipt.error }));
  if (receipt.status !== 'passed') process.exitCode = 1;
}
