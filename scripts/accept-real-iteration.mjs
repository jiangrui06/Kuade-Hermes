// Explicit real-model self-update of the normal Kuade profile. No provider fixtures.
import { _electron as electron, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

if (process.env.KUADE_REAL_ITERATION !== '1' || !process.env.KUADE_BUILD_ROOT) throw new Error('Set KUADE_REAL_ITERATION=1 and KUADE_BUILD_ROOT');
const root = resolve('.cache/real-iteration-' + randomUUID()); await mkdir(root, { recursive: true });
const source = resolve(process.env.KUADE_ITERATION_SOURCE ?? '.');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.KUADE_USER_DATA;
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const receipt = { status: 'not-passed', realProvider: true, source, phases: [] };
let app, page, profile, credentialsBefore, journal, result, stage = 'launch';
try {
  app = await electron.launch({ args: ['.'], cwd: resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  receipt.oldPid = await app.evaluate(() => process.pid);
  profile = await app.evaluate(({ app }) => app.getPath('userData'));
  credentialsBefore = await hash(join(profile, 'harness/.credentials.yaml'));
  const tasks = await page.evaluate(() => window.kuade.call('session/list', { _request: {} }));
  assert.ok(!tasks.items.some(row => row.running), 'Existing tasks must be idle');
  await page.getByRole('button', { name: '新任务' }).click();
  await expect(page.getByLabel('当前模型').locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型').locator('option').evaluateAll(rows => rows.map(row => row.value));
  receipt.model = options.find(value => value.endsWith('::' + (process.env.KUADE_ACCEPT_MODEL ?? 'kimi-k3')));
  assert.ok(receipt.model, 'Saved model not found');
  await page.getByLabel('当前模型').selectOption(receipt.model);
  if (await page.getByLabel('思考强度').isVisible()) await page.getByLabel('思考强度').selectOption('low');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, source);
  await page.getByRole('button', { name: '自我迭代', exact: true }).click();
  await page.getByRole('button', { name: '选择源码' }).click();
  receipt.requirement = '增加 Ctrl+Shift+I 打开“自我迭代”页面的快捷键，同时保留 Ctrl+N 新建任务行为。保持模块独立，不新增依赖。为快捷键补充有意义的组件测试，并在简体、繁体和英文文档说明。先阅读现有代码，再自行实现；真实运行相关测试。不要修改验收脚本、版本字段、基线或用户配置，不要自己启动安装器或重启应用。完成后由宿主独立测试、构建和自动更新。';
  await page.getByLabel('自迭代需求').fill(receipt.requirement);
  stage = 'iteration';
  let previousIterationId;
  try { previousIterationId = JSON.parse(await readFile(join(profile, 'iteration.json'), 'utf8')).state.id; } catch {}
  await page.getByRole('button', { name: '开始迭代并自动更新' }).click();
  // Clicking starts asynchronous model preparation. Do not mistake the preceding
  // run's persisted failure for the new run before it has acquired its journal.
  await expect.poll(async () => {
    try { const current = JSON.parse(await readFile(join(profile, 'iteration.json'), 'utf8')); return Boolean(current.state.id && current.state.id !== previousIterationId); }
    catch { return false; }
  }, { timeout: 130000, intervals: [500] }).toBe(true);
  const deadline = Date.now() + 35 * 60_000;
  let nextLog = 0;
  while (Date.now() < deadline) {
    try { journal = JSON.parse(await readFile(join(profile, 'iteration.json'), 'utf8')); } catch {}
    const phase = journal?.state?.phase;
    if (phase && receipt.phases.at(-1)?.phase !== phase) receipt.phases.push({ phase, at: Date.now() });
    if (phase && Date.now() >= nextLog) { console.log(JSON.stringify({ stage, phase, message: journal.state.message, sessionId: journal.state.sessionId, candidate: journal.state.candidate })); nextLog = Date.now() + 30000; }
    if (['failed', 'cancelled', 'rolled-back'].includes(phase)) throw new Error(journal.state.message);
    if (['restarting', 'completed'].includes(phase)) break;
    await new Promise(done => setTimeout(done, 2000));
  }
  assert.ok(['restarting', 'completed'].includes(journal?.state?.phase), 'Iteration acceptance time limit reached');
  stage = 'handoff';
  const update = join(profile, 'updates', journal.state.id);
  await expect.poll(async () => { try { result = JSON.parse(await readFile(join(update, 'result.json'), 'utf8')); return result.status; } catch { return 'waiting'; } }, { timeout: 330000, intervals: [1000] }).toBe('completed');
  receipt.result = result;
  assert.notEqual(result.pid, receipt.oldPid);
  await expect.poll(() => app.process().exitCode).not.toBeNull(); app = undefined;
  stage = 'independent-verification';
  const steps = JSON.parse(await readFile(join(journal.state.evidence, 'verification.json'), 'utf8'));
  assert.equal(steps.length, 6); assert.ok(steps.every(row => row.exitCode === 0)); receipt.verification = steps;
  const manifest = JSON.parse(await readFile(join(journal.state.candidate, '../source-manifest.json'), 'utf8'));
  for (const file of manifest.files) assert.equal(await hash(join(source, file.path)), file.sha256, 'Original source changed: ' + file.path);
  receipt.sourceUnchanged = true;
  receipt.credentialsUnchanged = credentialsBefore === await hash(join(profile, 'harness/.credentials.yaml'));
  assert.ok(receipt.credentialsUnchanged);
  const artifact = JSON.parse(await readFile(join(journal.state.evidence, 'artifact.json'), 'utf8'));
  receipt.artifact = { executable: artifact.executable, version: artifact.version, sha256: artifact.sha256, resourcesSha256: artifact.resourcesSha256, changes: artifact.changes };
  const client = new Client({ name: 'kuade-real-iteration-acceptance', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: resolve('resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const observed = await client.callTool({ name: 'get_app_state', arguments: { app: String(result.pid) } }, undefined, { timeout: 60000 });
    assert.ok(!observed.isError);
    assert.equal(observed.structuredContent?.desktop_observation?.pid, result.pid);
    const text = observed.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
    const target = text.match(/Observed target: (window:\d+:\d+)\./)?.[1]; assert.ok(target);
    const pressed = await client.callTool({ name: 'press_key', arguments: { app: target, key: 'ctrl+shift+i' } }, undefined, { timeout: 60000 });
    assert.ok(!pressed.isError);
    let after;
    await expect.poll(async () => {
      after = await client.callTool({ name: 'get_app_state', arguments: { app: target } }, undefined, { timeout: 60000 });
      assert.ok(!after.isError);
      const text = after.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
      return text.includes('自迭代需求') && text.includes('让 Kuade');
    }, { timeout: 30000, intervals: [500, 1000] }).toBe(true);
    const state = after.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
    await writeFile(join(root, 'updated-native-state.txt'), state);
    for (const row of after.content) if (row.type === 'image') await writeFile(join(root, 'updated-desktop.png'), Buffer.from(row.data, 'base64'));
    assert.ok(state.includes('自迭代需求') && state.includes('让 Kuade'));
    receipt.newShortcutVerified = true;
    const newTask = await client.callTool({ name: 'press_key', arguments: { app: target, key: 'ctrl+n' } }, undefined, { timeout: 60000 });
    assert.ok(!newTask.isError);
    await expect.poll(async () => {
      const current = await client.callTool({ name: 'get_app_state', arguments: { app: target } }, undefined, { timeout: 60000 });
      assert.ok(!current.isError);
      const text = current.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
      return text.includes('任务需求') && !text.includes('自迭代需求');
    }, { timeout: 30000, intervals: [500, 1000] }).toBe(true);
    receipt.existingShortcutVerified = true;
  } finally { await client.close(); await transport.close(); }
  receipt.status = 'passed';
  // The user's updated application remains open after a successful handoff.
} catch (error) {
  receipt.error = { stage, message: String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1500) };
  process.exitCode = 1;
} finally {
  if (app) {
    if (journal?.state?.sessionId) await page.evaluate(() => window.kuade.call('iteration/cancel')).catch(() => {});
    await app.close().catch(() => {});
  }
  receipt.candidate = journal?.state?.candidate; receipt.evidence = journal?.state?.evidence;
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, error: receipt.error, candidate: receipt.candidate, evidence: root }));
}
