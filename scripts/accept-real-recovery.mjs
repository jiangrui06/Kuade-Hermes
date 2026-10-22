// Real-provider recovery gate. A held local HTTP request marks an exact interruption point.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { parseSoakDuration } from './acceptance/soak-gate.mjs';
import { observeSessionList } from './acceptance/session-observation.mjs';
import { readSessionHistory } from './acceptance/session-history.mjs';
const { _electron: electron, expect } = createRequire(resolve('package.json'))('@playwright/test');
const exec = promisify(execFile);
if (process.env.KUADE_REAL_RECOVERY !== '1' || !process.env.KUADE_MODEL_PROFILE) throw new Error('Set KUADE_REAL_RECOVERY=1 and KUADE_MODEL_PROFILE');
const goalMode = process.env.KUADE_RECOVERY_GOAL === '1';
const soakMs = parseSoakDuration(process.env.KUADE_RECOVERY_SOAK_MS);
if (soakMs && !goalMode) throw new Error('Long-duration acceptance requires KUADE_RECOVERY_GOAL=1');
const root = join(process.env.KUADE_ACCEPT_ROOT ?? 'D:/Kuade-acceptance', (goalMode ? 'real-goal-' : 'real-recovery-') + randomUUID());
const profile = join(root, 'app'); const workspace = join(root, 'workspace');
await mkdir(join(profile, 'harness/profiles/web'), { recursive: true }); await mkdir(workspace);
const marker = randomUUID(); const held = new Set(); let released = false; let requestsBefore = 0; let requestsAfter = 0;
const gate = createServer((request, response) => {
  if (request.url !== '/' + marker) { response.writeHead(404).end(); return; }
  if (released) { requestsAfter++; response.end(marker); }
  else { requestsBefore++; held.add(response); response.on('close', () => held.delete(response)); }
});
await new Promise(done => gate.listen(0, '127.0.0.1', done));
const soakSource = await readFile(new URL('./acceptance/soak-gate.mjs', import.meta.url), 'utf8');
if (soakMs) await writeFile(join(workspace, 'soak-gate.mjs'), soakSource);
const soakCode = soakMs ? `import { runSummarySoak } from './soak-gate.mjs';\nimport { summarize } from './summary.mjs';\nimport { readFile } from 'node:fs/promises';\nlet previous;try{previous=JSON.parse(await readFile('soak-progress.json','utf8'));}catch{}\nif(previous?.status!=='passed'||previous.requestedDurationMs!==${soakMs}||previous.elapsedMs<${soakMs}) await runSummarySoak(summarize, {durationMs:${soakMs},progressPath:'soak-progress.json',onProgress:state=>console.log(JSON.stringify({elapsedMs:state.elapsedMs,checks:state.checks,rows:state.checkedRows}))});\n` : '';
const gateCode = `import { writeFile } from 'node:fs/promises';\nawait writeFile('waiting.json',JSON.stringify({marker:${JSON.stringify(marker)},pid:process.pid}));\n${soakCode}const response=await fetch('http://127.0.0.1:${gate.address().port}/${marker}');\nif(!response.ok || await response.text()!==${JSON.stringify(marker)})throw Error('Gate not released');\nawait writeFile('passed.json',JSON.stringify({marker:${JSON.stringify(marker)}}));\nconsole.log('Recovery gate passed');\n`;
await writeFile(join(workspace, 'gate.mjs'), gateCode);
const input = Array.from({ length: 137 }, (_, index) => ({ id: marker + '-' + index, category: ['开发', '运维', '设计'][index % 3], status: index % 7 ? 'paid' : 'void', amountCents: index % 5 ? index * 137 : -index * 43 }));
const expected = { count: 0, totalCents: 0, byCategory: {} };
for (const row of input.filter(row => row.status === 'paid')) { expected.count++; expected.totalCents += row.amountCents; expected.byCategory[row.category] = (expected.byCategory[row.category] ?? 0) + row.amountCents; }
const inputText = input.map(row => JSON.stringify(row)).join('\n') + '\n';
await writeFile(join(workspace, 'input.jsonl'), inputText);
const credentialSource = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml');
const temporaryCredentials = join(profile, 'harness/.credentials.yaml'); const temporarySettings = join(profile, 'harness/profiles/web/cordis.patch.yml');
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const before = await hash(credentialSource);
const receipt = { status: 'not-passed', realProvider: true, goalMode, requestedSoakMs: soakMs, durationScope: soakMs ? 'real-model module development followed by a paced, independently checked long shell workload and restart recovery; not hours of continuous code generation' : 'interruption/restart recovery, not an hours-long soak', marker };
const env = { ...process.env, KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
let app, page, sessionId; let stage = 'launch';
const launch = async () => {
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE;
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  receipt.application = await page.evaluate(() => window.kuade.call('app/info'));
  if (executablePath) {
    receipt.executable = resolve(executablePath);
    receipt.executableSha256 = await hash(executablePath);
    receipt.appArchiveSha256 = await hash(join(resolve(executablePath, '..'), 'resources/app.asar'));
  }
};
const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
const observationFailures = [];
const captureObservationFailure = async (error, attempt) => {
  const process = app?.process();
  let runtime;
  try { runtime = await page.evaluate(() => window.kuade.status()); }
  catch { runtime = { phase: 'unavailable' }; }
  let soak;
  try { soak = JSON.parse(await readFile(join(workspace, 'soak-progress.json'), 'utf8')); } catch {}
  observationFailures.push({ at: Date.now(), endpoint: 'session/list', attempt,
    message: String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1200),
    application: { pid: process?.pid, exitCode: process?.exitCode, signalCode: process?.signalCode }, runtime, soak });
  await writeFile(join(root, 'observation-failures.json'), JSON.stringify(observationFailures, null, 2));
};
const sessionList = () => observeSessionList(() => call('session/list', { _request: {} }), {
  onFailure: captureObservationFailure,
  alive: () => app.process().exitCode === null && !page.isClosed(),
});
const screenshotFailures = [];
const screenshot = async name => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { await page.screenshot({ path: join(root, name), animations: 'disabled', timeout: 15000 }); return; }
    catch (error) {
      screenshotFailures.push({ at: Date.now(), name, attempt, message: String(error.message).slice(0, 1200) });
      await writeFile(join(root, 'screenshot-failures.json'), JSON.stringify(screenshotFailures, null, 2));
      if (attempt === 2 || page.isClosed() || app.process().exitCode !== null) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
};
const history = async throughSeq => {
  const seq = throughSeq ?? (await call('session/projections', { request: { sessionId } })).asOfSeq;
  return readSessionHistory(request => call('session/page', { request }), { sessionId, throughSeq: seq });
};
try {
  await copyFile(credentialSource, temporaryCredentials);
  await copyFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'), temporarySettings);
  await launch(); receipt.initialPid = app.process().pid;
  const created = await call('workspace/create', { request: { path: workspace } });
  await page.reload(); await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  await page.getByRole('button', { name: '新任务' }).click();
  await page.getByLabel('当前项目', { exact: true }).selectOption(created.workspace.workspaceId);
  await expect(page.getByLabel('当前模型').locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型').locator('option').evaluateAll(rows => rows.map(row => row.value));
  const model = options.find(value => value.endsWith('::' + (process.env.KUADE_ACCEPT_MODEL ?? 'kimi-k3'))); assert.ok(model); receipt.model = model;
  await page.getByLabel('当前模型').selectOption(model);
  if (await page.getByLabel('思考强度').isVisible()) await page.getByLabel('思考强度').selectOption('low');
  await page.getByLabel('执行模式').selectOption('auto');
  const requirement = '完成当前项目的两阶段 JavaScript 账目汇总功能，并用 todo_write 记录至少两步计划。第一阶段：实现 summary.mjs，导出 summarize(rows)，只统计 status 严格为 paid 的记录，返回 {count,totalCents,byCategory}；byCategory 是按 category 汇总 amountCents 的对象，金额使用整数分，允许负数。补充 Node 单元测试并实际运行。第一阶段完成后必须运行已有 node gate.mjs 并等待它成功；这是宿主控制的长测试检查点，可能会重启应用，请不要绕过或修改 gate.mjs、soak-gate.mjs、soak-progress.json、input.jsonl、waiting.json、passed.json，不要自行请求该脚本的 HTTP 地址。第二阶段只有 gate 成功后才实现 cli.mjs，命令 node cli.mjs input.jsonl output.json 读取逐行 JSON 并输出 summarize 的 JSON 结果；实际运行并验证文件。完成后更新计划并报告结果。若被中断后收到继续，请先核对现有文件和记录，保留已正确实现的第一阶段，再重新执行未完成的 gate 与第二阶段。只操作当前临时工作区，不安装依赖，不做 Git 或远程操作。' + (soakMs ? `本次 gate 首次运行会持续至少 ${soakMs / 60000} 分钟，周期性用新数据校验你的模块；使用现有 job_output wait=true 及最长可用等待时间观察同一作业，不因等待超时而重启作业，不提前完成目标。` : '');
  const recoveryCheckpoint = '\n恢复后的检查点以文件为准：soak-progress.json 的 passed 只证明持续数据校验完成，不代表 gate.mjs 已成功。若 passed.json 不存在，必须重新运行 node gate.mjs 并等待退出码 0，再实现 CLI；该脚本会自动跳过已经通过的长时校验，因此重新运行不会再等待完整时长。禁止直接创建或修改 passed.json。';
  if (goalMode) {
    await page.getByText('设置持续目标', { exact: true }).click();
    await page.getByLabel('持续目标要求').fill('本次明确要求使用持续目标跨轮执行。每轮只处理一个阶段：第一轮完成第一阶段后结束回复，保留目标 active，让底座自动发起下一轮再运行 gate 与第二阶段；不要在第一轮运行 gate，不要提前标记完成。最终实际 CLI 测试通过后再使用 update_goal 标记 complete。\n' + requirement + recoveryCheckpoint);
    await page.getByLabel('自动轮数上限').fill(soakMs ? '256' : '8');
    await page.getByRole('button', { name: '开始持续目标', exact: true }).click();
  } else {
    await page.getByLabel('任务需求').fill(requirement + recoveryCheckpoint);
    await page.getByLabel('发送任务', { exact: true }).click();
  }
  stage = 'checkpoint';
  const deadline = Date.now() + soakMs + 10 * 60_000; let nextLog = 0;
  let observedSoakStartedAt; let soakObservations = 0;
  while (Date.now() < deadline && !held.size) {
    const task = (await sessionList()).items.find(row => row.cwd === workspace && !row.blank);
    if (task) sessionId = task.sessionId;
    if (Date.now() >= nextLog) {
      let soak; try { soak = JSON.parse(await readFile(join(workspace, 'soak-progress.json'), 'utf8')); } catch {}
      if (soak?.status === 'running') { observedSoakStartedAt ??= Date.now(); soakObservations++; }
      const progress = { status: 'running', stage, root, sessionId, at: Date.now(), soak };
      console.log(JSON.stringify(progress)); await writeFile(join(root, 'progress.json'), JSON.stringify(progress, null, 2)); nextLog = Date.now() + 30000;
    }
    await new Promise(done => setTimeout(done, 1000));
  }
  assert.ok(held.size && sessionId, 'Model did not reach the interruption checkpoint');
  if (soakMs) {
    receipt.soak = JSON.parse(await readFile(join(workspace, 'soak-progress.json'), 'utf8'));
    assert.equal(receipt.soak.status, 'passed'); assert.ok(receipt.soak.elapsedMs >= soakMs);
    assert.ok(observedSoakStartedAt && Date.now() - observedSoakStartedAt >= Math.max(0, soakMs - 60_000), 'Host did not observe the requested wall time');
    assert.ok(soakObservations >= Math.max(1, Math.floor(soakMs / 60_000)), 'Too few host heartbeat observations');
    receipt.soakObservation = { observedSoakStartedAt, observations: soakObservations, checkedAt: Date.now() };
    assert.equal(await readFile(join(workspace, 'soak-gate.mjs'), 'utf8'), soakSource);
    // The second invocation tests recovery, rather than running the same soak twice.
    await writeFile(join(root, 'soak-completed.json'), JSON.stringify(receipt.soak, null, 2));
  }
  const initialThroughSeq = (await call('session/projections', { request: { sessionId } })).asOfSeq;
  const initial = await history(initialThroughSeq);
  assert.ok(initial.records.some(row => row.event.type === 'tool/call'), 'Real tool execution required');
  const checkpoint = JSON.parse(await readFile(join(workspace, 'waiting.json'), 'utf8')); assert.equal(checkpoint.marker, marker);
  assert.equal(await readFile(join(workspace, 'gate.mjs'), 'utf8'), gateCode);
  if (soakMs) {
    assert.equal(await readFile(join(workspace, 'soak-gate.mjs'), 'utf8'), soakSource);
    assert.deepEqual(JSON.parse(await readFile(join(workspace, 'soak-progress.json'), 'utf8')), receipt.soak);
  }
  const sourceHash = await hash(join(workspace, 'summary.mjs'));
  const checked = await exec(process.execPath, ['--input-type=module', '-e', "import {summarize} from './summary.mjs';import {readFile} from 'node:fs/promises';console.log(JSON.stringify(summarize((await readFile('input.jsonl','utf8')).trim().split('\\n').map(JSON.parse))))"], { cwd: workspace, windowsHide: true, timeout: 30000 });
  assert.deepEqual(JSON.parse(checked.stdout.trim()), expected);
  const projection = await call('session/projections', { request: { sessionId } });
  // Upstream resets the current-turn projection at turn/start. A continued goal
  // can retain a valid earlier plan in history without rewriting it this turn.
  const checkpointTodos = projection.values.todos ?? initial.records.findLast(row => row.event.type === 'todo/write')?.event.data.todos;
  assert.ok(Array.isArray(checkpointTodos), 'No persisted model-authored plan found');
  assert.ok(checkpointTodos.some(row => row.status === 'completed') && checkpointTodos.some(row => row.status !== 'completed'), 'Expected completed and remaining plan steps');
  receipt.planSource = projection.values.todos ? 'current-turn projection' : 'persisted todo/write event';
  receipt.checkpoint = { sessionId, sourceHash, taskPid: checkpoint.pid, requestsBefore };
  if (goalMode) {
    receipt.goalBeforeRestart = await call('goals/get', { agentId: sessionId });
    assert.ok(receipt.goalBeforeRestart.roundsStarted >= 2, 'Automatic continuation did not start a second round');
  }
  stage = 'restart';
  // Quit only this isolated Playwright-owned app. Its normal shutdown stops its runtime tree.
  await app.close(); app = undefined;
  await expect.poll(() => held.size, { timeout: 15000 }).toBe(0);
  let taskAlive = true; try { process.kill(checkpoint.pid, 0); } catch { taskAlive = false; }
  assert.equal(taskAlive, false, 'Interrupted command process remained alive');
  released = true;
  await launch(); receipt.restartedPid = app.process().pid; assert.notEqual(receipt.restartedPid, receipt.initialPid);
  await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
  const progress = page.getByRole('region', { name: '任务进度' });
  await expect(progress).toContainText('已中断', { timeout: 30000 });
  await expect(page.getByRole('button', { name: goalMode ? '恢复目标' : '继续任务', exact: true })).toBeEnabled({ timeout: 130000 });
  if (goalMode) {
    const restoredGoal = await call('goals/get', { agentId: sessionId });
    assert.equal(restoredGoal.id, receipt.goalBeforeRestart.id); assert.equal(restoredGoal.activation, 'disarmed');
    assert.equal(restoredGoal.roundsStarted, receipt.goalBeforeRestart.roundsStarted);
    receipt.goalAfterRestart = restoredGoal;
  }
  await screenshot('restored.png');
  assert.equal(await hash(join(workspace, 'summary.mjs')), sourceHash);
  const restored = await history(initialThroughSeq);
  const priorSequences = initial.records.map(row => row.event.seq);
  assert.ok(priorSequences.every(seq => restored.records.some(row => row.event.seq === seq)), 'Persisted event prefix missing');
  assert.deepEqual(restored.records.map(row => row.event), initial.records.map(row => row.event), 'Persisted event content changed');
  stage = 'continue'; await page.getByRole('button', { name: goalMode ? '恢复目标' : '继续任务', exact: true }).click();
  let final; const completionDeadline = Date.now() + 10 * 60_000; nextLog = 0;
  while (Date.now() < completionDeadline) {
    const task = (await sessionList()).items.find(row => row.sessionId === sessionId);
    final = await history(); const ends = final.records.filter(row => row.event.type === 'turn/end');
    const continued = goalMode ? (await call('goals/get', { agentId: sessionId }))?.phase === 'complete' : final.records.some(row => row.event.type === 'user/message' && JSON.stringify(row.event.data).includes('继续当前任务'));
    if (!task.running && ends.at(-1)?.event.data.reason.kind === 'completed' && continued) break;
    if (Date.now() >= nextLog) { console.log(JSON.stringify({ stage, root, sessionId })); nextLog = Date.now() + 30000; }
    await new Promise(done => setTimeout(done, 1500));
  }
  const settledTask = (await sessionList()).items.find(row => row.sessionId === sessionId);
  assert.ok(settledTask && !settledTask.running, 'Continued task is still running');
  assert.equal(final.records.filter(row => row.event.type === 'turn/end').at(-1)?.event.data.reason.kind, 'completed');
  // The plan is model-authored and can lag behind a completed goal. Certify the
  // actual goal and independent output below; retain disagreement as evidence.
  receipt.progressLabel = await progress.innerText();
  receipt.finalTodos = (await call('session/projections', { request: { sessionId } })).values.todos;
  if (goalMode) {
    receipt.completedGoal = await call('goals/get', { agentId: sessionId });
    assert.equal(receipt.completedGoal.phase, 'complete');
    assert.ok(receipt.completedGoal.roundsStarted > receipt.goalBeforeRestart.roundsStarted);
  }
  assert.ok(requestsAfter > 0); assert.equal(JSON.parse(await readFile(join(workspace, 'passed.json'), 'utf8')).marker, marker);
  assert.deepEqual(JSON.parse(await readFile(join(workspace, 'output.json'), 'utf8')), expected);
  assert.equal(await hash(join(workspace, 'summary.mjs')), sourceHash);
  assert.equal(await readFile(join(workspace, 'input.jsonl'), 'utf8'), inputText);
  assert.equal(await readFile(join(workspace, 'gate.mjs'), 'utf8'), gateCode);
  if (soakMs) {
    assert.equal(await readFile(join(workspace, 'soak-gate.mjs'), 'utf8'), soakSource);
    assert.deepEqual(JSON.parse(await readFile(join(workspace, 'soak-progress.json'), 'utf8')), receipt.soak);
  }
  await exec(process.execPath, ['cli.mjs', 'input.jsonl', 'independent-output.json'], { cwd: workspace, timeout: 30000, windowsHide: true });
  assert.deepEqual(JSON.parse(await readFile(join(workspace, 'independent-output.json'), 'utf8')), expected);
  const sessions = (await sessionList()).items.filter(row => !row.blank); assert.equal(sessions.length, 1); assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(await hash(credentialSource), before);
  await screenshot('completed.png');
  await writeFile(join(root, 'history.json'), JSON.stringify(final, null, 2));
  Object.assign(receipt, { status: 'passed', sessionId, sameSession: true, originalModuleUnchanged: true, originalCredentialsUnchanged: true, requestsAfter, inputRows: input.length, expected });
} catch (error) {
  receipt.error = { stage, message: String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1200) }; process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: join(root, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close().catch(() => {});
  for (const response of held) response.destroy(); gate.closeAllConnections(); await new Promise(done => gate.close(done));
  await rm(temporaryCredentials, { force: true }); await rm(temporarySettings, { force: true });
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  await writeFile(join(root, 'progress.json'), JSON.stringify({ status: receipt.status, stage, root, sessionId, at: Date.now(), error: receipt.error }, null, 2));
  console.log(JSON.stringify({ status: receipt.status, error: receipt.error, root }));
}
