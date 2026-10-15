// Run from a built Kuade development directory; use the user's saved model.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const { _electron: electron, expect } = createRequire(resolve('package.json'))('@playwright/test');
const exec = promisify(execFile);
if (process.env.KUADE_REAL_GIT !== '1') throw new Error('Set KUADE_REAL_GIT=1');
if (!process.env.KUADE_MODEL_PROFILE) throw new Error('Set KUADE_MODEL_PROFILE to the saved model profile');
const root = join(process.env.KUADE_ACCEPT_ROOT ?? 'D:/Kuade-acceptance', 'real-git-' + randomUUID());
const remote = join(root, 'remote.git'); const project = join(root, 'worktree');
await mkdir(root, { recursive: true });
const git = async (args, cwd = root) => (await exec('git', args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 30000 })).stdout.trim();
await git(['init', '--bare', '--initial-branch=main', remote]);
await git(['clone', remote, project]);
await git(['config', 'user.name', 'Kuade acceptance'], project);
await git(['config', 'user.email', 'acceptance@example.invalid'], project);
await writeFile(join(project, 'README.md'), 'Kuade isolated Git acceptance fixture.\n');
await git(['add', '--', 'README.md'], project);
await git(['commit', '-m', 'Initialize isolated acceptance fixture'], project);
await git(['push', '-u', 'origin', 'main'], project);
const initialHead = await git(['rev-parse', 'HEAD'], project);
const marker = 'Kuade Git 验收 ' + randomUUID();
const receipt = { status: 'not-passed', realProvider: true, localRemote: true, githubWrites: false, root, initialHead };
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
let app, page, sessionId, credentialsBefore, profile;
const fixtureProfile = join(root, 'app');
const originalCredentials = join(process.env.KUADE_MODEL_PROFILE, 'harness/.credentials.yaml');
const temporaryCredentials = join(fixtureProfile, 'harness/.credentials.yaml');
const temporarySettings = join(fixtureProfile, 'harness/profiles/web/cordis.patch.yml');
const env = { ...process.env, KUADE_USER_DATA: fixtureProfile }; delete env.ELECTRON_RUN_AS_NODE;
try {
  // Reuse only model credentials/settings in an isolated test instance. Never
  // copy sessions or extensions; remove the temporary credentials on every exit.
  credentialsBefore = await hash(originalCredentials);
  await mkdir(join(fixtureProfile, 'harness/profiles/web'), { recursive: true });
  await copyFile(originalCredentials, temporaryCredentials);
  await copyFile(join(process.env.KUADE_MODEL_PROFILE, 'harness/profiles/web/cordis.patch.yml'), temporarySettings);
  const executablePath = process.env.KUADE_ACCEPT_EXECUTABLE;
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  page = await app.firstWindow();
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
  profile = await app.evaluate(({ app }) => app.getPath('userData'));
  assert.equal(resolve(profile), resolve(fixtureProfile));
  const call = (endpoint, args) => page.evaluate(({ endpoint, args }) => window.kuade.call(endpoint, args), { endpoint, args });
  const tasks = (await call('session/list', { _request: {} })).items;
  assert.ok(!tasks.some(row => row.running), 'Existing tasks must be idle');
  const workspace = await call('workspace/create', { request: { path: project } });
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
  const prompt = `请在当前临时验收仓库完成真实 Git 工作流：先检查状态与最近提交，然后新建 git-proof.txt，内容严格为“${marker}”（可带末尾换行）。检查 Diff，只暂存该文件，以消息 Verify Kuade Git workflow 提交，然后推送到已配置的 origin main。最后检查工作区干净且本地与 origin/main 一致。这个 origin 是本机专用 bare 仓库，允许你完成这一次提交与推送。不创建分支，不改 remote，不修改 README.md、Git 配置或其他目录。不要只给命令，直接执行并报告实际结果。`;
  await page.getByLabel('任务需求').fill(prompt);
  await page.getByLabel('发送任务', { exact: true }).click();
  let boundary, history; const start = Date.now(); let nextLog = 0;
  while (Date.now() - start < 15 * 60_000) {
    const rows = (await call('session/list', { _request: {} })).items;
    const task = rows.find(row => row.cwd === project && !row.blank && !tasks.some(old => old.sessionId === row.sessionId));
    if (task) {
      sessionId = task.sessionId;
      if (!task.running) {
        const projection = await call('session/projections', { request: { sessionId } });
        history = await call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 100 } });
        boundary = history.records.map(row => row.event).findLast(row => row.type === 'turn/start' || row.type === 'turn/end');
        if (boundary?.type === 'turn/end') break;
      }
    }
    if (Date.now() >= nextLog) { console.log(JSON.stringify({ stage: 'git-task', sessionId, elapsedSeconds: Math.round((Date.now() - start) / 1000) })); nextLog = Date.now() + 30000; }
    await new Promise(done => setTimeout(done, 1500));
  }
  assert.equal(boundary?.data?.reason?.kind, 'completed', 'Real model task must complete');
  assert.ok(history.records.some(row => row.event.type === 'tool/call'), 'Tool invocation missing');
  const localHead = await git(['rev-parse', 'HEAD'], project);
  const remoteHead = await git(['--git-dir', remote, 'rev-parse', 'refs/heads/main']);
  assert.notEqual(localHead, initialHead); assert.equal(localHead, remoteHead);
  assert.equal(await git(['rev-parse', 'origin/main'], project), remoteHead);
  assert.equal(await git(['status', '--porcelain=v1'], project), '');
  assert.equal(await git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], project), 'git-proof.txt');
  assert.equal(await git(['--git-dir', remote, 'show', 'refs/heads/main:git-proof.txt']), marker);
  assert.equal(await git(['log', '-1', '--format=%s'], project), 'Verify Kuade Git workflow');
  assert.equal(await readFile(join(project, 'README.md'), 'utf8'), 'Kuade isolated Git acceptance fixture.\n');
  assert.equal(await hash(join(profile, 'harness/.credentials.yaml')), credentialsBefore);
  assert.equal(await hash(originalCredentials), credentialsBefore);
  await writeFile(join(root, 'history.json'), JSON.stringify(history, null, 2));
  Object.assign(receipt, { status: 'passed', sessionId, localHead, remoteHead, clean: true, credentialsUnchanged: true });
} catch (error) {
  receipt.error = String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1200); process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await rm(temporaryCredentials, { force: true });
  await rm(temporarySettings, { force: true });
  await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, error: receipt.error, root }));
}
