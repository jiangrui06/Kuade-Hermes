// Opt-in real-provider gate. Credentials stay inside the user's existing runtime.
import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

if (process.env.KUADE_REAL_CAPABILITIES !== '1') throw new Error('Set KUADE_REAL_CAPABILITIES=1 for real model and desktop acceptance');
if (!process.env.KUADE_MODEL_PROFILE) throw new Error('Set KUADE_MODEL_PROFILE; real acceptance uses an isolated copy of model settings');
const phase = process.env.KUADE_ACCEPT_PHASE ?? 'all';
const expectUX = process.env.KUADE_EXPECT_CAPABILITY_UX === '1';
assert.ok(['all', 'web', 'computer'].includes(phase));
const root = resolve(process.env.KUADE_ACCEPT_ROOT ?? '.cache', 'real-capabilities-' + randomUUID());
const project = join(root, 'project');
const profile = join(root, 'app');
await mkdir(join(project, '.agents/skills/acceptance-workflow'), { recursive: true });
await mkdir(join(profile, 'harness/profiles/web'), { recursive: true });
const marker = 'Kuade 技能验收 ' + randomUUID();
const submissions = [];
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.method === 'POST' && request.url === '/submit') {
    let body = ''; for await (const chunk of request) body += chunk;
    const data = Object.fromEntries(new URLSearchParams(body));
    submissions.push({ ...data, at: Date.now() });
    response.end('<h1>Submission received</h1><p>验收器已收到表单。</p>'); return;
  }
  response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Kuade browser acceptance</title><h1>Kuade browser acceptance</h1><form method="post" action="/submit"><label>验收标记<input name="marker" required></label><label>官方文档链接<input name="url" type="url" required></label><button type="submit">提交验收</button></form></html>');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const target = `http://127.0.0.1:${server.address().port}/`;
await writeFile(join(project, '.agents/skills/acceptance-workflow/SKILL.md'), `---\nname: acceptance-workflow\ndescription: 本次 Kuade 联网与浏览器验收工作流，包含私有验收标记与目标表单。\n---\n使用 search MCP 搜索 Electron app relaunch 官方文档，再用 fetch_content 阅读找到的官方文档。使用 playwright MCP 打开 ${target} 并交互填写表单。验收标记字段必须精确填写：${marker}\n官方文档链接字段填写实际搜索并读取的 Electron 官方 app 文档地址。通过浏览器点击提交验收按钮，观察提交成功。不要通过终端、脚本或 HTTP 客户端代替浏览器填写；不要读取测试脚本或其他项目目录。\n`);
function environmentFingerprint() {
  const script = `function Hash-Environment($scope) { $items=[Environment]::GetEnvironmentVariables($scope); $rows=@($items.Keys | Sort-Object | ForEach-Object { [string]$_+'='+[string]$items[$_] }); $bytes=[Text.Encoding]::UTF8.GetBytes(($rows -join [char]0)); [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)) }; @{ User=(Hash-Environment 'User'); Machine=(Hash-Environment 'Machine') } | ConvertTo-Json -Compress`;
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Environment snapshot');
  return { ...JSON.parse(result.stdout), process: createHash('sha256').update(JSON.stringify(Object.entries(process.env).sort())).digest('hex') };
}
const receipt = { status: 'not-passed', realProvider: true, phase, steps: [], before: environmentFingerprint() };
const env = { ...process.env, KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
const temporaryCredentials = join(profile, 'harness/.credentials.yaml');
const temporarySettings = join(profile, 'harness/profiles/web/cordis.patch.yml');
let app, page, originalConfig, credentialPath, credentialHash, settingsHash, fixture, sessionId;
let stage = 'launch';
const hashFile = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
async function capture(name) {
  // A compositor timeout must not replay a model task or desktop action.
  try { await page.screenshot({ path: join(root, name), timeout: 15000 }); }
  catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    receipt.screenshotRetries = [...(receipt.screenshotRetries ?? []), name];
    await page.bringToFront();
    await page.screenshot({ path: join(root, name), timeout: 30000 });
  }
}
async function runTask(prompt, name) {
  stage = name;
  await page.getByRole('button', { name: '新任务' }).click();
  await page.getByLabel('当前项目', { exact: true }).selectOption(receipt.workspaceId);
  await page.getByLabel('当前模型', { exact: true }).selectOption(receipt.model);
  if (await page.getByLabel('思考强度', { exact: true }).isVisible()) await page.getByLabel('思考强度', { exact: true }).selectOption('low');
  await page.getByLabel('执行模式').selectOption('auto');
  const previous = (await call('session/list', { _request: {} })).items.map(row => row.sessionId);
  const start = Date.now();
  if (name === 'web-skill') {
    const draft = '请保留这段需求，并完成指定技能中的验收。';
    if (expectUX) await page.getByLabel('任务需求').fill(draft);
    await page.getByRole('button', { name: '工具与技能', exact: true }).click();
    await page.getByRole('region', { name: '项目技能' }).locator('article').filter({ has: page.getByRole('heading', { name: 'acceptance-workflow', exact: true }) }).getByRole('button', { name: '用于任务' }).click();
    await expect(page.getByLabel('任务需求')).toHaveValue(/acceptance-workflow/);
    if (expectUX) await expect(page.getByLabel('任务需求')).toHaveValue(new RegExp(draft));
    receipt.skillEntryUsed = true;
  }
  const input = page.getByLabel('任务需求');
  await input.fill(name === 'web-skill' ? `${await input.inputValue()}\n${prompt}` : prompt);
  await page.getByLabel('发送任务', { exact: true }).click();
  let history, boundary;
  for (let nextLog = 0; Date.now() - start < 12 * 60_000;) {
    const tasks = (await call('session/list', { _request: {} })).items;
    const task = tasks.find(row => row.cwd === project && !row.blank && !previous.includes(row.sessionId));
    if (task) {
      sessionId = task.sessionId;
      if (!task.running) {
        const projection = await call('session/projections', { request: { sessionId } });
        history = await call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 100 } });
        boundary = history.records.map(row => row.event).findLast(event => event.type === 'turn/start' || event.type === 'turn/end');
        if (boundary?.type === 'turn/end') break;
      }
    }
    if (Date.now() > nextLog) { console.log(JSON.stringify({ stage, elapsedSeconds: Math.round((Date.now() - start) / 1000), sessionId })); nextLog = Date.now() + 30000; }
    await new Promise(done => setTimeout(done, 1500));
  }
  const inventory = await call('kuadeCapabilities/inventory');
  const calls = inventory.calls.filter(row => row.at >= start);
  receipt.steps.push({ name, sessionId, reason: boundary?.data?.reason?.kind, calls, eventTypes: [...new Set(history?.records.map(row => row.event.type) ?? [])] });
  // Only this newly-created fixture task is saved, never settings or credential values.
  if (history) await writeFile(join(root, name + '-history.json'), JSON.stringify(history, null, 2));
  await capture(name + '.png');
  await page.getByRole('button', { name: '展开执行过程', exact: true }).click();
  receipt.steps.at(-1).visibleToolLabels = await page.locator('.tool-event > summary').allTextContents();
  if (expectUX) {
    const labels = receipt.steps.at(-1).visibleToolLabels;
    assert.ok(labels.some(label => label.includes(name === 'computer' ? '电脑控制 ·' : '联网搜索 ·')));
    assert.ok(!labels.some(label => label.includes('mcp__')), 'Known tools should have readable labels');
  }
  await capture(name + '-tools.png');
  assert.equal(boundary?.data?.reason?.kind, 'completed', 'Actual turn must complete');
  return { calls, history };
}
try {
  credentialPath = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml'); credentialHash = await hashFile(credentialPath);
  settingsHash = await hashFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'));
  await copyFile(credentialPath, temporaryCredentials);
  await copyFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'), temporarySettings);
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE;
  receipt.executablePath = executablePath ?? 'development';
  if (executablePath) receipt.executableSha256 = await hashFile(executablePath);
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: executablePath ? project : resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  receipt.version = await app.evaluate(({ app }) => app.getVersion());
  receipt.packaged = await app.evaluate(({ app }) => app.isPackaged);
  if (executablePath) {
    assert.equal(receipt.packaged, true);
    receipt.appArchiveSha256 = await hashFile(join(dirname(executablePath), 'resources/app.asar'));
  }
  assert.ok(!(await call('session/list', { _request: {} })).items.some(row => row.running), 'Existing tasks must be idle');
  stage = 'configure-tools';
  console.log(JSON.stringify({ stage }));
  originalConfig = await call('extensions/read');
  const native = await call('extensions/computer');
  receipt.nativeCommand = native.command;
  receipt.nativeSha256 = await hashFile(native.command);
  if (executablePath) assert.equal(resolve(native.command), resolve(dirname(executablePath), 'resources/computer/qwen-computer-use.exe'));
  await page.getByRole('button', { name: '工具与技能', exact: true }).click();
  for (const name of ['浏览器操作', '联网搜索', '电脑控制']) {
    const toggle = page.getByRole('switch', { name, exact: true });
    await expect(toggle).toBeEnabled({ timeout: 130000 });
    await toggle.click();
    await expect(toggle).toBeChecked({ timeout: 130000 });
    await expect(toggle).toBeEnabled({ timeout: 130000 });
  }
  receipt.toolsEnabledThroughUI = true;
  await expect.poll(async () => (await call('extensions/status')).servers.filter(row => row.state === 'registered').length, { timeout: 130000 }).toBe(3);
  console.log(JSON.stringify({ stage: 'tools-registered' }));
  if (expectUX) {
    for (const title of ['浏览器操作', '联网搜索', '电脑控制']) {
      await expect(page.getByRole('article', { name: title, exact: true })).toContainText('可调用', { timeout: 15000 });
    }
    await page.getByRole('article', { name: '联网搜索', exact: true }).getByRole('button', { name: '试一试' }).click();
    await expect(page.getByLabel('任务需求')).toHaveValue(/app.relaunch/);
    assert.ok(!(await call('session/list', { _request: {} })).items.some(row => row.running));
    receipt.exampleDraftOnly = true;
    await page.getByRole('button', { name: '工具与技能', exact: true }).click();
  }
  await capture('tools-enabled.png');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await expect(page.getByLabel('当前项目', { exact: true }).locator('option:checked')).toHaveText('project');
  receipt.workspaceId = await page.getByLabel('当前项目', { exact: true }).inputValue();
  await page.reload();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  await expect(page.getByLabel('当前模型').locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型').locator('option').evaluateAll(rows => rows.map(row => row.value));
  receipt.model = options.find(value => value.endsWith('::' + (process.env.KUADE_ACCEPT_MODEL ?? 'kimi-k3')));
  assert.ok(receipt.model, 'Saved real model not found');
  const [provider, ...modelParts] = receipt.model.split('::');
  const modelInfo = await call('models/prepare', { provider, model: modelParts.join('::') });
  receipt.inputModalities = modelInfo.inputModalities;
  if (phase !== 'computer') {
    const result = await runTask('这是受控验收任务。请调用 skill 工具加载当前项目的 acceptance-workflow 技能，并完整执行技能中的联网搜索、网页阅读和浏览器提交任务。只在当前项目和技能指定的网页操作。不安装依赖、不访问其他目录。直接执行，无需额外询问。', 'web-skill');
    assert.ok(result.calls.some(row => row.name === 'mcp__search__search' && row.outcome === 'succeeded'));
    assert.ok(result.calls.some(row => row.name === 'mcp__search__fetch_content' && row.outcome === 'succeeded'));
    for (const name of ['browser_navigate', 'browser_click']) assert.ok(result.calls.some(row => row.name === 'mcp__playwright__' + name && row.outcome === 'succeeded'));
    assert.ok(result.history.records.some(row => row.event.type === 'tool/call' && row.event.data?.name === 'skill' && JSON.parse(row.event.data.arguments).name === 'acceptance-workflow'), 'Skill tool call missing from history');
    assert.ok(submissions.some(row => row.marker === marker && /^https:\/\/www\.electronjs\.org\/docs\/.+\/api\/app/.test(row.url)));
    receipt.submissions = submissions; receipt.steps.at(-1).verified = true;
  }
  if (phase !== 'web') {
    const title = 'Kuade real-model fixture ' + randomUUID().slice(0, 8);
    const text = 'Kuade 真实模型桌面 ' + randomUUID().slice(0, 8);
    const resultPath = join(root, 'native-input.txt'), readyPath = join(root, 'native-ready.txt');
    fixture = spawn('powershell.exe', ['-NoProfile', '-STA', '-File', resolve('tests/fixtures/computer-window.ps1'), '-ResultPath', resultPath, '-WindowTitle', title, '-ReadyPath', readyPath], { windowsHide: true, stdio: 'ignore' });
    await expect.poll(() => readFile(readyPath, 'utf8').catch(() => ''), { timeout: 20000 }).toBe(String(fixture.pid));
    const result = await runTask(`只操作进程 ${fixture.pid} 的「${title}」专用测试窗口。使用 qwen_computer 观察窗口，在 Acceptance input 输入框精确填写「${text}」，点击 Verify input，观察 Accepted 状态后结束。必须通过电脑控制 MCP 完成操作，每次依据当前观察定位。禁止终端、脚本、直接写文件或操作其他窗口。`, 'computer');
    const succeeded = name => result.calls.some(row => row.name === 'mcp__qwen_computer__' + name && row.outcome === 'succeeded');
    assert.ok(succeeded('get_app_state'));
    assert.ok(succeeded('type_text') || succeeded('set_value'), 'Requires a native text input action');
    const invoked = result.history.records.some(row => row.event.type === 'tool/call' && row.event.data?.name === 'mcp__qwen_computer__perform_secondary_action' && JSON.parse(row.event.data.arguments).action === 'Invoke');
    assert.ok(succeeded('click') || (succeeded('perform_secondary_action') && invoked), 'Requires native button activation');
    assert.equal(await readFile(resultPath, 'utf8'), text);
    const results = result.history.records.filter(row => row.event.type === 'tool/result').map(row => row.event.data.message);
    assert.ok(results.some(message => message?.content?.some(block => block.type === 'text' && block.text.includes('Accepted: ' + text))), 'Native observation must confirm the input was accepted');
    receipt.steps.at(-1).acceptedStateObserved = true;
    receipt.steps.at(-1).imageUnavailable = results.some(message => message?.content?.some(block => block.type === 'text' && block.text.includes('[image unavailable:')));
    const desktopCalls = result.history.records.filter(row => row.event.type === 'tool/call').map(row => row.event.data);
    for (const tool of desktopCalls) {
      assert.ok(tool.name === 'skill' || tool.name.startsWith('mcp__qwen_computer__'), 'Desktop task must use computer MCP rather than scripts');
      const args = JSON.parse(tool.arguments);
      if (args.app !== undefined) assert.ok(args.app === String(fixture.pid) || args.app.startsWith(`window:${fixture.pid}:`), 'Desktop actions must target the fixture window');
    }
    receipt.steps.at(-1).verified = true;
    receipt.steps.at(-1).fixturePid = fixture.pid;
  }
  if (expectUX) {
    await page.getByRole('button', { name: '工具与技能', exact: true }).click();
    const computerCard = page.getByRole('article', { name: '电脑控制', exact: true });
    if (receipt.inputModalities?.includes('image')) await expect(computerCard).toContainText('连接已声明支持图片输入');
    else if (receipt.inputModalities) await expect(computerCard).toContainText('当前连接未声明图片输入');
    await capture('tools-final.png');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
    await capture('tools-narrow.png');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    receipt.capabilityUXVerified = true;
  }
  receipt.status = 'passed';
} catch (error) {
  if (page) await page.screenshot({ path: join(root, 'last-state.png') }).catch(() => {});
  receipt.error = { stage, name: error.name, message: String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1200) };
  process.exitCode = 1;
} finally {
  if (sessionId) await call('session/cancel', { request: { sessionId } }).catch(() => {});
  if (originalConfig) {
    try { await call('extensions/save', { config: originalConfig }); receipt.extensionsRestored = true; }
    catch { receipt.extensionsRestored = false; receipt.status = 'not-passed'; process.exitCode = 1; }
  }
  if (credentialPath) receipt.credentialsUnchanged = credentialHash === await hashFile(credentialPath);
  if (settingsHash) receipt.modelSettingsUnchanged = settingsHash === await hashFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'));
  const teardown = await Promise.allSettled([app?.close(), Promise.resolve().then(() => { if (fixture && fixture.exitCode === null) fixture.kill(); })]);
  receipt.teardownErrors = teardown.filter(row => row.status === 'rejected').map(row => String(row.reason));
  await rm(temporaryCredentials, { force: true }); await rm(temporarySettings, { force: true });
  receipt.temporaryCredentialsRemoved = true;
  await new Promise(done => server.close(done));
  receipt.after = environmentFingerprint();
  receipt.environmentUnchanged = Object.keys(receipt.before).every(key => receipt.before[key] === receipt.after[key]);
  if (!receipt.environmentUnchanged || receipt.credentialsUnchanged === false || receipt.modelSettingsUnchanged === false || receipt.teardownErrors.length) { receipt.status = 'not-passed'; process.exitCode = 1; }
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, evidence: root }));
}
