// Opt-in real Kuade goal. This runner supplies requirements and checks results;
// it never writes the benchmark application's implementation.
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { projectManagerSpec } from './acceptance/project-manager-spec.mjs';
import { verifyProjectManager } from './acceptance/project-manager-verify.mjs';
const { _electron: electron, chromium, expect } = createRequire(resolve('package.json'))('@playwright/test');
if (process.env.KUADE_REAL_PROJECT !== '1' || !process.env.KUADE_MODEL_PROFILE || !process.env.KUADE_ACCEPT_EXECUTABLE) throw new Error('Set KUADE_REAL_PROJECT=1, KUADE_MODEL_PROFILE and KUADE_ACCEPT_EXECUTABLE');
const root = join(process.env.KUADE_ACCEPT_ROOT ?? 'D:/Kuade-acceptance', 'real-project-' + randomUUID());
const workspace = join(root, 'workspace'), profile = join(root, 'app');
await mkdir(workspace, { recursive: true }); await mkdir(join(profile, 'harness/profiles/web'), { recursive: true });
const credentialSource = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml');
const settingsSource = join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml');
const credentials = join(profile, 'harness/.credentials.yaml'), settings = join(profile, 'harness/profiles/web/cordis.patch.yml');
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const originalHashes = [await hash(credentialSource), await hash(settingsSource)];
const receipt = { status: 'running', realProvider: true, scope: 'Local project manager built from empty directory by Kuade; a bounded full-stack benchmark, not proof of arbitrary large-project success', root, workspace, startedAt: new Date().toISOString(), attempts: [] };
await writeFile(join(root, 'specification.txt'), projectManagerSpec);
const env = { ...process.env, KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
let app, page, sessionId, stage = 'launch';
const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
const getHistory = async () => call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: (await call('session/projections', { request: { sessionId } })).asOfSeq, maxMessages: 100 } });
async function waitForModel({ initial = false, afterSeq = -1 } = {}) {
  const deadline = Date.now() + 40 * 60000; let nextLog = 0;
  while (Date.now() < deadline) {
    const task = (await call('session/list', { _request: {} })).items.find(row => row.cwd === workspace && !row.blank);
    if (task) {
      sessionId = task.sessionId;
      const goal = await call('goals/get', { agentId: sessionId });
      if (!task.running) {
        const history = await getHistory();
        const end = history.records.findLast(row => row.event.type === 'turn/end');
        if (end && end.event.seq > afterSeq && (!initial || goal?.phase === 'complete')) {
          assert.equal(end.event.data.reason.kind, 'completed', 'Model turn did not complete');
          return { history, goal };
        }
        if (initial && goal && ['paused', 'blocked', 'error', 'budget_exhausted'].includes(goal.phase)) throw new Error('Goal stopped: ' + goal.phase);
      }
      if (Date.now() >= nextLog) {
        const progress = { status: 'running', stage, root, sessionId, goalPhase: goal?.phase, roundsStarted: goal?.roundsStarted, at: new Date().toISOString() };
        console.log(JSON.stringify(progress)); await writeFile(join(root, 'progress.json'), JSON.stringify(progress, null, 2)); nextLog = Date.now() + 30000;
      }
    }
    await new Promise(done => setTimeout(done, 1500));
  }
  const error = new Error('Observation time budget reached; incomplete, not classified as application failure'); error.code = 'OBSERVATION_LIMIT'; throw error;
}
try {
  stage = 'browser-preflight';
  try {
    const probe = await chromium.launch({ channel: process.env.KUADE_ACCEPT_BROWSER_CHANNEL ?? 'msedge', headless: true });
    receipt.browserVersion = probe.version(); await probe.close();
  } catch (error) { error.code = 'BROWSER_ENVIRONMENT'; throw error; }
  stage = 'launch';
  await copyFile(credentialSource, credentials); await copyFile(settingsSource, settings);
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE;
  app = await electron.launch({ executablePath, args: [], cwd: resolve('.'), env }); page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  receipt.application = await call('app/info'); receipt.executablePath = executablePath;
  receipt.executableSha256 = await hash(executablePath); receipt.appArchiveSha256 = await hash(join(resolve(executablePath, '..'), 'resources/app.asar'));
  const created = await call('workspace/create', { request: { path: workspace } });
  await page.reload(); await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  await page.getByRole('button', { name: '新任务' }).click();
  await page.getByLabel('当前项目', { exact: true }).selectOption(created.workspace.workspaceId);
  await expect(page.getByLabel('当前模型').locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型').locator('option').evaluateAll(rows => rows.map(row => row.value));
  receipt.model = options.find(value => value.endsWith('::' + (process.env.KUADE_ACCEPT_MODEL ?? 'kimi-k3'))); assert.ok(receipt.model);
  await page.getByLabel('当前模型').selectOption(receipt.model);
  if (await page.getByLabel('思考强度').isVisible()) await page.getByLabel('思考强度').selectOption('low');
  await page.getByLabel('执行模式').selectOption('auto');
  await page.getByText('设置持续目标', { exact: true }).click();
  await page.getByLabel('持续目标要求').fill(projectManagerSpec);
  await page.getByLabel('自动轮数上限').fill('16');
  await page.getByRole('button', { name: '开始持续目标', exact: true }).click(); stage = 'model-development';
  let modelResult = await waitForModel({ initial: true }); receipt.goal = modelResult.goal;
  assert.ok(receipt.goal.roundsStarted >= 3, 'Expected the requested multi-round goal continuation');
  for (let attempt = 1; attempt <= 3; attempt++) {
    receipt.sessionId = sessionId;
    await writeFile(join(root, `history-${attempt}.json`), JSON.stringify(modelResult.history, null, 2));
    const evidence = join(root, 'verification-' + attempt); await mkdir(evidence);
    stage = 'independent-verification-' + attempt; console.log(JSON.stringify({ stage, root, sessionId }));
    const checked = await verifyProjectManager({ workspace, evidence, chromium, expect });
    receipt.attempts.push({ attempt, ...checked, evidence });
    await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    if (checked.status === 'passed') { receipt.status = 'passed'; break; }
    if (checked.failureKind === 'environment') { receipt.status = 'incomplete'; break; }
    if (attempt === 3) { receipt.status = 'not-passed'; break; }
    // Feedback is observable output, never a patch to the generated application.
    const afterSeq = (await call('session/projections', { request: { sessionId } })).asOfSeq;
    await page.getByLabel('任务需求').fill(`外部独立验收第 ${attempt} 次发现：\n${checked.error}\n已通过：${checked.checks.join('；')}。请根据原需求检查并修复应用，实际运行相关测试，保留已有正确功能。仅改当前工作区；不要读取外部验收器或修改验收结果。完成后报告修复与测试。`);
    await page.getByLabel('发送任务', { exact: true }).click(); stage = 'model-repair-' + attempt;
    modelResult = await waitForModel({ afterSeq });
  }
  await page.screenshot({ path: join(root, 'kuade-completed.png'), fullPage: true, timeout: 10000 }).catch(error => { receipt.screenshotWarning = String(error.message).slice(0, 500); });
} catch (error) {
  receipt.status = ['OBSERVATION_LIMIT', 'BROWSER_ENVIRONMENT'].includes(error.code) ? 'incomplete' : 'not-passed'; receipt.error = { stage, message: String(error.message).slice(0, 2000) };
  if (page && !page.isClosed()) await page.screenshot({ path: join(root, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close().catch(() => {});
  await rm(credentials, { force: true }); await rm(settings, { force: true });
  receipt.temporaryCredentialsRemoved = true;
  receipt.originalSettingsUnchanged = JSON.stringify(originalHashes) === JSON.stringify([await hash(credentialSource), await hash(settingsSource)]);
  if (!receipt.originalSettingsUnchanged) receipt.status = 'not-passed';
  receipt.finishedAt = new Date().toISOString(); receipt.sessionId = sessionId;
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  await writeFile(join(root, 'progress.json'), JSON.stringify({ status: receipt.status, stage, root, sessionId, error: receipt.error, at: receipt.finishedAt }, null, 2));
  console.log(JSON.stringify(receipt)); if (receipt.status !== 'passed') process.exitCode = 1;
}
