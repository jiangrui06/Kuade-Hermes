// Continue a retained, completed soak after an acceptance-observer failure.
// Never changes the original failed receipt or reruns/credits a shorter soak.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, copyFile, mkdir, readdir, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readSessionHistory } from './acceptance/session-history.mjs';
import { observeSessionList } from './acceptance/session-observation.mjs';

assert.equal(process.env.KUADE_REAL_RECOVERY, '1');
assert.ok(process.env.KUADE_RESUME_SOAK_ROOT && process.env.KUADE_MODEL_PROFILE);
const source = resolve(process.env.KUADE_RESUME_SOAK_ROOT);
const original = JSON.parse(await readFile(join(source, 'acceptance.json'), 'utf8'));
assert.equal(original.status, 'not-passed');
assert.equal(original.error?.message, 'No persisted model-authored plan found');
assert.equal(original.soak?.status, 'passed');
assert.ok(original.soak.elapsedMs >= original.requestedSoakMs && original.requestedSoakMs === 86400000);
const root = join(source, 'post-soak-recovery-' + randomUUID());
await mkdir(root);
const profile = join(source, 'app'), workspace = join(source, 'workspace');
const receipt = { status: 'not-passed', source, originalStatus: original.status,
  scope: 'Delayed same-session recovery after a completed 24-hour soak and a failed acceptance history read; original run remains not-passed',
  startedAt: Date.now(), soak: original.soak };
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const persist = async () => writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
const { _electron: electron, expect } = createRequire(resolve('package.json'))('@playwright/test');
const exec = promisify(execFile);
const credentialSource = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml');
const settingsSource = join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml');
const temporaryCredentials = join(profile, 'harness/.credentials.yaml');
const temporarySettings = join(profile, 'harness/profiles/web/cordis.patch.yml');
let app, page, server, copied = false, stage = 'validate';
let requests = 0;
const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
const launch = async () => {
  const env = { ...process.env, KUADE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: original.executable, args: [], cwd: resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
};
const screenshot = async name => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { await page.screenshot({ path: join(root, name), animations: 'disabled', timeout: 15000 }); return; }
    catch (error) {
      (receipt.screenshotFailures ??= []).push({ name, attempt, message: String(error.message).slice(0, 500) });
      if (attempt === 2 || page.isClosed()) throw error;
    }
  }
};
try {
  assert.equal(await hash(original.executable), original.executableSha256);
  assert.equal(await hash(join(original.executable, '..', 'resources/app.asar')), original.appArchiveSha256);
  const protectedNames = ['acceptance.json', 'soak-completed.json', 'workspace/summary.mjs', 'workspace/gate.mjs', 'workspace/soak-gate.mjs', 'workspace/soak-progress.json', 'workspace/input.jsonl'];
  const protectedHashes = Object.fromEntries(await Promise.all(protectedNames.map(async name => [name, await hash(join(source, name))])));
  receipt.protectedHashes = protectedHashes;
  assert.deepEqual(JSON.parse(await readFile(join(workspace, 'soak-progress.json'), 'utf8')), original.soak);
  const sessionsPath = join(profile, 'harness/sessions');
  const logs = (await readdir(sessionsPath, { recursive: true })).filter(p => p.endsWith('session.v4.jsonl.zstd'));
  assert.equal(logs.length, 1);
  const log = await readFile(join(sessionsPath, logs[0]));
  await writeFile(join(root, 'original-session.v4.jsonl.zstd'), log);
  let offset = 0, decoded = '';
  while (offset < log.length) { const frame = zstdDecompressSync(log.subarray(offset), { info: true }); assert.ok(frame.engine.bytesWritten > 0); offset += frame.engine.bytesWritten; decoded += frame.buffer.toString('utf8'); }
  const rows = decoded.trim().split('\n').map(JSON.parse);
  const header = rows.find(r => r.type === 'session');
  const sessionId = header.id; receipt.sessionId = sessionId;
  const plan = rows.findLast(r => r.type === 'todo/write');
  assert.ok(plan?.data.todos.some(t => t.status === 'completed') && plan.data.todos.some(t => t.status !== 'completed'));
  const goalEvent = rows.findLast(r => r.type === 'goal/change');
  assert.equal(goalEvent.data.goal.phase, 'active');
  receipt.persistedPlanSeq = plan.seq;
  receipt.persistedLogSha256 = createHash('sha256').update(log).digest('hex');
  const checkpoint = JSON.parse(await readFile(join(workspace, 'waiting.json'), 'utf8'));
  assert.equal(checkpoint.marker, original.marker);
  let workloadAlive = true; try { process.kill(checkpoint.pid, 0); } catch { workloadAlive = false; }
  assert.equal(workloadAlive, false, 'Original workload still exists; do not resume twice');
  await assert.rejects(access(join(workspace, 'passed.json')));
  await assert.rejects(access(temporaryCredentials)); await assert.rejects(access(temporarySettings));
  receipt.originalCredentialHash = await hash(credentialSource);
  receipt.originalSettingsHash = await hash(settingsSource);
  const gateCode = await readFile(join(workspace, 'gate.mjs'), 'utf8');
  const endpoint = new URL(gateCode.match(/fetch\('(http:\/\/127\.0\.0\.1:\d+\/[^']+)'\)/)?.[1]);
  assert.equal(endpoint.pathname, '/' + original.marker);
  server = createServer((request, response) => {
    if (request.url !== endpoint.pathname) return void response.writeHead(404).end();
    requests++; response.end(original.marker);
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(Number(endpoint.port), '127.0.0.1', done); });
  copied = true;
  await copyFile(credentialSource, temporaryCredentials); await copyFile(settingsSource, temporarySettings);
  stage = 'restore'; await launch(); receipt.firstPid = app.process().pid;
  await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
  await expect(page.getByRole('button', { name: '恢复目标', exact: true })).toBeEnabled({ timeout: 130000 });
  const goalBefore = await call('goals/get', { agentId: sessionId });
  assert.equal(goalBefore.id, goalEvent.data.goal.id); assert.equal(goalBefore.activation, 'disarmed');
  assert.equal(goalBefore.phase, 'active'); assert.ok(goalBefore.roundsStarted >= 2);
  receipt.goalBefore = goalBefore;
  const throughSeq = (await call('session/projections', { request: { sessionId } })).asOfSeq;
  const tail = await call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq, maxMessages: 100 } });
  assert.equal(tail.hasMore, true); assert.equal(tail.records.some(r => r.event.type === 'todo/write'), false);
  const history = seq => readSessionHistory(request => call('session/page', { request }), { sessionId, throughSeq: seq });
  const initial = await history(throughSeq);
  assert.deepEqual(initial.records.find(r => r.event.seq === plan.seq)?.event.data, plan.data);
  receipt.history = { throughSeq, tailRecords: tail.records.length, fullRecords: initial.records.length, planSeq: plan.seq };
  await screenshot('restored.png');
  // Reopen without resuming: the complete prefix and goal must still persist.
  stage = 'restart'; await app.close(); app = undefined;
  await launch(); receipt.restartedPid = app.process().pid;
  assert.notEqual(receipt.restartedPid, receipt.firstPid);
  await page.locator(`.recent-task[data-session-id="${sessionId}"]`).click();
  await expect(page.getByRole('button', { name: '恢复目标', exact: true })).toBeEnabled({ timeout: 130000 });
  const restoredGoal = await call('goals/get', { agentId: sessionId });
  assert.equal(restoredGoal.id, goalBefore.id); assert.equal(restoredGoal.roundsStarted, goalBefore.roundsStarted);
  assert.equal(restoredGoal.activation, 'disarmed');
  assert.deepEqual((await history(throughSeq)).records, initial.records);
  receipt.persistedPrefixUnchanged = true;
  stage = 'resume'; await page.getByRole('button', { name: '恢复目标', exact: true }).click();
  const deadline = Date.now() + 10 * 60_000; let finalGoal, task;
  while (Date.now() < deadline) {
    const list = await observeSessionList(() => call('session/list', { _request: {} }), { alive: () => app.process().exitCode === null });
    task = list.items.find(r => r.sessionId === sessionId);
    finalGoal = await call('goals/get', { agentId: sessionId });
    if (task && !task.running && finalGoal.phase === 'complete') break;
    await writeFile(join(root, 'progress.json'), JSON.stringify({ stage, sessionId, at: Date.now(), running: task?.running, goal: finalGoal.phase, rounds: finalGoal.roundsStarted }));
    await new Promise(done => setTimeout(done, 3000));
  }
  assert.ok(task && !task.running); assert.equal(finalGoal.phase, 'complete');
  assert.equal(finalGoal.id, goalBefore.id); assert.ok(finalGoal.roundsStarted > goalBefore.roundsStarted);
  receipt.completedGoal = finalGoal;
  const final = await history((await call('session/projections', { request: { sessionId } })).asOfSeq);
  assert.equal(final.records.filter(r => r.event.type === 'turn/end').at(-1)?.event.data.reason.kind, 'completed');
  assert.ok(requests > 0); assert.equal(JSON.parse(await readFile(join(workspace, 'passed.json'), 'utf8')).marker, original.marker);
  const input = (await readFile(join(workspace, 'input.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const expected = { count: 0, totalCents: 0, byCategory: {} };
  for (const row of input.filter(r => r.status === 'paid')) { expected.count++; expected.totalCents += row.amountCents; expected.byCategory[row.category] = (expected.byCategory[row.category] ?? 0) + row.amountCents; }
  await exec(process.execPath, ['cli.mjs', 'input.jsonl', join(root, 'independent-output.json')], { cwd: workspace, timeout: 30000, windowsHide: true });
  assert.deepEqual(JSON.parse(await readFile(join(root, 'independent-output.json'), 'utf8')), expected);
  assert.deepEqual(JSON.parse(await readFile(join(workspace, 'output.json'), 'utf8')), expected);
  for (const name of protectedNames) assert.equal(await hash(join(source, name)), protectedHashes[name], `Protected file changed: ${name}`);
  assert.equal(await hash(credentialSource), receipt.originalCredentialHash); assert.equal(await hash(settingsSource), receipt.originalSettingsHash);
  await screenshot('completed.png');
  receipt.expected = expected; receipt.inputRows = input.length; receipt.gateRequests = requests;
  receipt.sameSession = true; receipt.originalFilesUnchanged = true;
  receipt.status = 'passed';
} catch (error) {
  receipt.error = { stage, message: String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1200) };
  process.exitCode = 1;
} finally {
  if (app) {
    try { await app.close(); }
    catch (error) { receipt.status = 'not-passed'; receipt.cleanupError = String(error.message).slice(0, 500); process.exitCode = 1; }
  }
  if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  if (copied) { await rm(temporaryCredentials, { force: true }); await rm(temporarySettings, { force: true }); receipt.temporaryCredentialsRemoved = true; }
  receipt.finishedAt = Date.now(); await persist();
  await writeFile(join(root, 'progress.json'), JSON.stringify({ status: receipt.status, stage, sessionId: receipt.sessionId, at: receipt.finishedAt, error: receipt.error }));
  console.log(JSON.stringify({ root, status: receipt.status, error: receipt.error }));
}
