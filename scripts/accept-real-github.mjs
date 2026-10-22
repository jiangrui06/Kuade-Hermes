// Opt-in desktop acceptance: official GitHub MCP and a real provider.
// Read-only by default; writing the fixed record requires separate explicit opt-in.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyGitHubRead, verifyGitHubWrite, GITHUB_WRITE_PATH, GITHUB_WRITE_MESSAGE } from './acceptance/github-evidence.mjs';
const { _electron: electron, expect } = createRequire(resolve('package.json'))('@playwright/test');
const exec = promisify(execFile);
if (process.env.KUADE_REAL_GITHUB !== '1' || !process.env.KUADE_MODEL_PROFILE) throw new Error('Set KUADE_REAL_GITHUB=1 and KUADE_MODEL_PROFILE');
const root = join(process.env.KUADE_ACCEPT_ROOT ?? 'D:/Kuade-acceptance', 'real-github-' + randomUUID());
const profile = join(root, 'app'); const workspacePath = join(root, 'workspace');
const originalCredentials = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml');
const temporaryCredentials = join(profile, 'harness/.credentials.yaml');
const temporarySettings = join(profile, 'harness/profiles/web/cordis.patch.yml');
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const reference = JSON.parse((await exec('gh', ['api', 'repos/jiangrui06/Kuade-Hermes/commits/main', '--jq', '{sha: .sha}'], { windowsHide: true })).stdout);
const readme = JSON.parse((await exec('gh', ['api', `repos/jiangrui06/Kuade-Hermes/contents/README.md?ref=${reference.sha}`, '--jq', '{sha: .sha}'], { windowsHide: true })).stdout);
const account = JSON.parse((await exec('gh', ['api', 'user', '--jq', '{login, id}'], { windowsHide: true })).stdout);
const writeFilePath = process.env.KUADE_GITHUB_WRITE_RECORD;
const writeContent = writeFilePath ? await readFile(writeFilePath, 'utf8') : undefined;
let previousBlob;
if (writeContent) {
  assert.equal(JSON.parse(writeContent).status, 'passed');
  assert.equal(JSON.parse(writeContent).githubWrites, false);
  const tree = JSON.parse((await exec('gh', ['api', `repos/jiangrui06/Kuade-Hermes/git/trees/${reference.sha}?recursive=1`], { windowsHide: true })).stdout);
  assert.equal(tree.truncated, false);
  if (process.env.KUADE_GITHUB_REPAIR_WRITE === '1') {
    const current = JSON.parse((await exec('gh', ['api', `repos/jiangrui06/Kuade-Hermes/contents/${GITHUB_WRITE_PATH}?ref=${reference.sha}`], { windowsHide: true })).stdout);
    // Repair only the specific observed transcription defect in this approved record.
    assert.equal(Buffer.from(current.content, 'base64').toString('utf8'), writeContent.replace('kuade-ca49e51b::kimi-k3', 'kuade-ca49e51b:kimi-k3'));
    previousBlob = current.sha;
  } else assert.ok(!tree.tree.some(row => row.path === GITHUB_WRITE_PATH), 'Write acceptance creates a new record only');
}
const receipt = { status: 'not-passed', realProvider: true, realMcp: true, githubWrites: Boolean(writeContent), expectedCommit: reference.sha };
let app, before;
const env = { ...process.env, KUADE_USER_DATA: profile };
for (const key of ['ELECTRON_RUN_AS_NODE', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']) delete env[key];
try {
  await mkdir(join(profile, 'harness/profiles/web'), { recursive: true });
  await mkdir(workspacePath, { recursive: true });
  before = await hash(originalCredentials);
  await copyFile(originalCredentials, temporaryCredentials);
  await copyFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'), temporarySettings);
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE;
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  const page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
  await page.getByRole('button', { name: '工具与技能' }).click();
  await page.getByRole('button', { name: '添加GitHub' }).click();
  await expect(page.getByRole('status')).toContainText('工具已注册不代表已登录', { timeout: 240000 });
  await page.getByRole('button', { name: '保存并重新加载' }).click();
  await expect(page.getByRole('status')).toContainText('配置已保存', { timeout: 130000 });
  await expect.poll(async () => (await call('extensions/status')).servers.find(row => row.name === 'github')?.state, { timeout: 60000 }).toBe('registered');
  const workspace = await call('workspace/create', { request: { path: workspacePath } });
  await page.reload();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  await page.getByRole('button', { name: '新任务' }).click();
  await page.getByLabel('当前项目', { exact: true }).selectOption(workspace.workspace.workspaceId);
  await expect(page.getByLabel('当前模型').locator('option')).not.toHaveCount(0, { timeout: 60000 });
  const options = await page.getByLabel('当前模型').locator('option').evaluateAll(rows => rows.map(row => row.value));
  const model = options.find(value => value.endsWith('::' + (process.env.KUADE_ACCEPT_MODEL ?? 'kimi-k3')));
  assert.ok(model); receipt.model = model;
  await page.getByLabel('当前模型').selectOption(model);
  if (await page.getByLabel('思考强度').isVisible()) await page.getByLabel('思考强度').selectOption('low');
  await page.getByLabel('执行模式').selectOption('auto');
  await page.getByLabel('任务需求').fill(writeContent
    ? `用户已明确批准这一次 GitHub MCP 远程写入：先调用 get_me，然后用 list_commits 确认 jiangrui06/Kuade-Hermes 的 main 最新提交严格等于 ${reference.sha}；若不一致，停止并报告。然后只调用一次 create_or_update_file，在 main ${previousBlob ? `修正 ${GITHUB_WRITE_PATH}，必须传 sha=${previousBlob}。上一次模型误将 kuade-ca49e51b::kimi-k3 写成少一个冒号的值，本次只修正这个转录错误` : `新增 ${GITHUB_WRITE_PATH}`}，提交信息必须为 ${GITHUB_WRITE_MESSAGE}。content 参数严格使用下面文件原文（保留末尾换行），不要编码为 Base64。不要创建分支、评论、Issue，也不要改其他文件，不用终端或 gh。首次调用若等待 OAuth，等待用户完成，不操作登录页。完成后报告工具实际返回的提交 SHA。文件原文开始：\n${writeContent}`
    : '请真实使用已连接的 GitHub MCP 做只读验收：调用 get_me 获取登录账号，然后读取 jiangrui06/Kuade-Hermes 的 main 分支最新提交及 README.md，报告账号、完整提交 SHA 和 README 中的一条实际内容。只使用 GitHub MCP，不用终端、gh、网页搜索或预置知识代替。首次调用若等待浏览器授权，请等待用户手动完成；不要操作登录页面，不显示授权 URL、验证码或令牌。不要创建分支或修改任何本地与远程文件，也不要提交、评论或创建 Issue。');
  await page.getByLabel('发送任务', { exact: true }).click();
  const seen = new Set(); let history, boundary, sessionId;
  const deadline = Date.now() + 15 * 60_000; let nextLog = 0;
  while (Date.now() < deadline) {
    const task = (await call('session/list', { _request: {} })).items.find(row => row.cwd === workspacePath && !row.blank);
    if (task) {
      sessionId = task.sessionId;
      const projection = await call('session/projections', { request: { sessionId } });
      history = await call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 100 } });
      for (const row of history.records) if (row.event.type === 'tool/call' && !seen.has(row.event.data.callId)) {
        seen.add(row.event.data.callId); console.log(JSON.stringify({ stage: 'tool-call', name: row.event.data.name }));
      }
      boundary = history.records.map(row => row.event).findLast(row => row.type === 'turn/start' || row.type === 'turn/end');
      if (!task.running && boundary?.type === 'turn/end') break;
    }
    if (Date.now() >= nextLog) { console.log(JSON.stringify({ stage: writeContent ? 'github-write' : 'github-read', root, sessionId })); nextLog = Date.now() + 30000; }
    await new Promise(done => setTimeout(done, 1500));
  }
  assert.equal(boundary?.data?.reason?.kind, 'completed', 'Real model task must complete');
  const events = history.records.map(row => row.event);
  let verified;
  if (writeContent) {
    const remoteCommit = JSON.parse((await exec('gh', ['api', 'repos/jiangrui06/Kuade-Hermes/commits/main'], { windowsHide: true })).stdout);
    const remoteContent = JSON.parse((await exec('gh', ['api', `repos/jiangrui06/Kuade-Hermes/contents/${GITHUB_WRITE_PATH}?ref=${remoteCommit.sha}`], { windowsHide: true })).stdout);
    verified = verifyGitHubWrite(events, { content: writeContent, parent: reference.sha, remoteCommit, remoteContent, previousBlob });
  } else verified = verifyGitHubRead(events, { commit: reference.sha, readmeBlob: readme.sha, login: account.login, userId: account.id });
  assert.equal(await hash(originalCredentials), before);
  Object.assign(receipt, { status: 'passed', sessionId, credentialsUnchanged: true, ...verified });
} catch (error) {
  receipt.error = String(error.message).replace(/https?:\/\/\S+/g, '[url]').replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1000);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await rm(temporaryCredentials, { force: true }); await rm(temporarySettings, { force: true });
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, error: receipt.error, root }));
}
