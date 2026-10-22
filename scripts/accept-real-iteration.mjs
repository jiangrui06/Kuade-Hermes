// Real-model self-update in an isolated profile. No provider fixtures.
import { _electron as electron, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, copyFile, rm, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

if (process.env.KUADE_REAL_ITERATION !== '1' || !process.env.KUADE_BUILD_ROOT || !process.env.KUADE_MODEL_PROFILE) throw new Error('Set KUADE_REAL_ITERATION=1, KUADE_BUILD_ROOT and KUADE_MODEL_PROFILE');
const historyScenario = process.env.KUADE_ITERATION_SCENARIO === 'task-history';
assert.ok(!process.env.KUADE_ITERATION_SCENARIO || ['task-history', 'model-connection'].includes(process.env.KUADE_ITERATION_SCENARIO), 'Unknown iteration scenario');
const shortcut = historyScenario ? { playwright: 'Control+Shift+H', native: 'ctrl+shift+h', labels: ['搜索任务', '筛选任务'] } : { playwright: 'Control+Shift+M', native: 'ctrl+shift+m', labels: ['连接名称', 'API 地址'] };
const featureVisible = text => shortcut.labels.every(label => text.includes(label)) && !text.includes('自迭代需求');
const root = join(process.env.KUADE_ACCEPT_ROOT ?? 'D:/Kuade-acceptance', 'real-iteration-' + randomUUID()); await mkdir(root, { recursive: true });
const source = resolve(process.env.KUADE_ITERATION_SOURCE ?? '.');
const profile = join(root, 'app');
await mkdir(join(profile, 'harness/profiles/web'), { recursive: true });
const credentialSource = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml');
const temporaryCredentials = join(profile, 'harness/.credentials.yaml');
const temporarySettings = join(profile, 'harness/profiles/web/cordis.patch.yml');
const env = { ...process.env, KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const receipt = { status: 'not-passed', realProvider: true, source, scenario: historyScenario ? 'task-history' : 'model-connection', phases: [] };
const exec = promisify(execFile);
let app, page, credentialsBefore, journal, result, stage = 'launch';
try {
  credentialsBefore = await hash(credentialSource);
  await copyFile(credentialSource, temporaryCredentials);
  await copyFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'), temporarySettings);
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE ? await realpath(process.env.KUADE_ACCEPT_EXECUTABLE) : undefined;
  if (executablePath) {
    for (let directory = dirname(executablePath);;) {
      assert.equal(existsSync(join(directory, 'node_modules')), false, 'Package must be independent of source dependencies');
      const parent = dirname(directory); if (parent === directory) break; directory = parent;
    }
    receipt.executable = executablePath;
    receipt.executableSha256 = await hash(executablePath);
    receipt.appArchiveSha256 = await hash(join(dirname(executablePath), 'resources/app.asar'));
  }
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  receipt.oldPid = await app.evaluate(() => process.pid);
  receipt.applicationBefore = await page.evaluate(() => window.kuade.call('app/info'));
  if (executablePath) assert.equal(receipt.applicationBefore.packaged, true);
  assert.equal(receipt.applicationBefore.version, JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version, 'Source and running application versions must match');
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
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
  await page.getByRole('button', { name: /^自我迭代/ }).click();
  await page.getByRole('button', { name: '选择源码' }).click();
  receipt.requirement = '增加 Ctrl+Shift+M 打开“模型连接”页面的快捷键，并在该导航按钮显示快捷键提示；保留 Ctrl+N 新建任务和 Ctrl+Shift+I 自我迭代行为，普通 M、Ctrl+M 和 Alt 组合不应触发。保持现有 shortcuts 模块与调用方兼容，新增动作应允许现有调用方省略（原始测试也必须继续通过）。保持模块独立，不新增依赖。为新增快捷键及未提供回调的边界补充有意义的组件测试，并在简体、繁体和英文文档说明。先阅读现有代码，再自行实现；真实运行相关测试。只操作当前候选源码，不修改验收脚本、版本字段、基线或用户配置，不要自己启动安装器或重启应用。完成后由宿主独立测试、构建和自动更新。';
  if (historyScenario) receipt.requirement = '增加 Ctrl+Shift+H 打开“任务记录”页面的快捷键，并在导航按钮显示快捷键提示和 aria-keyshortcuts；保持按钮可访问名称为“任务记录”。保留 Ctrl+N 新建任务、Ctrl+Shift+I 自我迭代和 Ctrl+Shift+M 模型连接；普通 H、Ctrl+H（无 Shift）及带 Alt 的组合不触发。复用现有 shortcuts 模块，新增回调可选，兼容现有调用方。新增有意义的快捷键组件测试，覆盖未提供回调、不匹配组合和新旧快捷键行为，并更新简体、繁体、英文说明。保持模块独立，不新增依赖。先阅读代码再实现，真实运行相关测试。只修改当前候选源码，不修改验收脚本、版本字段、基线、原项目或用户配置，不自行启动安装器或重启应用；由宿主独立测试、打包和自动更新。';
  await page.keyboard.press(shortcut.playwright);
  await expect(page.getByLabel('自迭代需求')).toBeVisible();
  receipt.featureAbsentBefore = true;
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
  assert.deepEqual(steps.map(row => row.name), ['dependencies', 'typecheck', 'baseline-tests', 'desktop-build', 'electron-runtime', 'package', 'packaged-startup']); assert.ok(steps.every(row => row.exitCode === 0)); receipt.verification = steps;
  const manifest = JSON.parse(await readFile(join(journal.state.candidate, '../source-manifest.json'), 'utf8'));
  for (const file of manifest.files) assert.equal(await hash(join(source, file.path)), file.sha256, 'Original source changed: ' + file.path);
  receipt.sourceUnchanged = true;
  receipt.credentialsUnchanged = credentialsBefore === await hash(credentialSource) && credentialsBefore === await hash(temporaryCredentials);
  assert.ok(receipt.credentialsUnchanged);
  const artifact = JSON.parse(await readFile(join(journal.state.evidence, 'artifact.json'), 'utf8'));
  receipt.artifact = { executable: artifact.executable, version: artifact.version, sha256: artifact.sha256, resourcesSha256: artifact.resourcesSha256, changes: artifact.changes };
  const client = new Client({ name: 'kuade-real-iteration-acceptance', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: join(dirname(artifact.executable), 'resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const observed = await client.callTool({ name: 'get_app_state', arguments: { app: String(result.pid) } }, undefined, { timeout: 60000 });
    assert.ok(!observed.isError);
    assert.equal(observed.structuredContent?.desktop_observation?.pid, result.pid);
    const text = observed.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
    const target = text.match(/Observed target: (window:\d+:\d+)\./)?.[1]; assert.ok(target);
    const pressed = await client.callTool({ name: 'press_key', arguments: { app: target, key: shortcut.native } }, undefined, { timeout: 60000 });
    assert.ok(!pressed.isError);
    let after;
    await expect.poll(async () => {
      after = await client.callTool({ name: 'get_app_state', arguments: { app: target } }, undefined, { timeout: 60000 });
      assert.ok(!after.isError);
      const text = after.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
      return featureVisible(text);
    }, { timeout: 30000, intervals: [500, 1000] }).toBe(true);
    const state = after.content.filter(row => row.type === 'text').map(row => row.text).join('\n');
    await writeFile(join(root, 'updated-native-state.txt'), state);
    for (const row of after.content) if (row.type === 'image') await writeFile(join(root, 'updated-desktop.png'), Buffer.from(row.data, 'base64'));
    assert.ok(featureVisible(state));
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
  // Only the isolated test application is closed below.
} catch (error) {
  receipt.error = { stage, message: String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1500) };
  process.exitCode = 1;
} finally {
  if (app) {
    if (journal?.state?.sessionId) await page.evaluate(() => window.kuade.call('iteration/cancel')).catch(() => {});
    await app.close().catch(() => {});
  }
  let candidatePid = result?.pid;
  if (!candidatePid && journal?.state?.id) {
    try { candidatePid = JSON.parse(await readFile(join(profile, 'updates', journal.state.id, 'candidate-process.json'), 'utf8')).pid; } catch {}
  }
  if (Number.isSafeInteger(candidatePid) && candidatePid > 0) {
    // PID alone is insufficient if a candidate exited before cleanup. Confirm
    // both the unique artifact and this run's handoff argument before stopping it.
    try {
      const handoff = JSON.parse(await readFile(join(profile, 'updates', journal.state.id, 'handoff.json'), 'utf8'));
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ProcessId=${candidatePid}" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`], { windowsHide: true });
      const processInfo = stdout.trim() ? JSON.parse(stdout) : null;
      if (processInfo && resolve(processInfo.ExecutablePath).toLowerCase() === resolve(handoff.candidate.executable).toLowerCase() && processInfo.CommandLine?.includes(join(profile, 'updates', journal.state.id))) {
        await exec('taskkill', ['/PID', String(candidatePid), '/T', '/F'], { windowsHide: true });
      } else if (processInfo) receipt.cleanupWarning = 'Candidate PID identity changed; left process untouched';
    } catch (error) { receipt.cleanupWarning = String(error.message).slice(0, 300); }
  }
  await rm(temporaryCredentials, { force: true });
  await rm(temporarySettings, { force: true });
  receipt.temporaryCredentialsRemoved = true;
  receipt.candidate = journal?.state?.candidate; receipt.evidence = journal?.state?.evidence;
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, error: receipt.error, candidate: receipt.candidate, evidence: root }));
}
