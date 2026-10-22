import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);

export async function startProjectServer(workspace, database, logPath) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: workspace, windowsHide: true, env: { ...process.env, PORT: '0', DATA_FILE: database }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; let exited = false;
  const exit = new Promise(done => child.once('exit', () => { exited = true; done(); }));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not publish its listening port within 30s')), 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited before ready: ' + code)); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.on('data', chunk => {
      stdout += chunk;
      for (const line of stdout.split(/\r?\n/)) {
        try { const data = JSON.parse(line); if (Number.isInteger(data.port) && data.port > 0 && data.port < 65536) { clearTimeout(timer); resolve(data.port); } } catch {}
      }
    });
  });
  const stop = async () => {
    if (!exited) child.kill();
    await Promise.race([exit, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Owned server did not exit')), 10000); timer.unref(); })]);
    await writeFile(logPath, stdout + '\nSTDERR\n' + stderr);
  };
  try { return { url: 'http://127.0.0.1:' + await ready, pid: child.pid, stop }; }
  catch (error) { await stop(); throw error; }
}

export async function verifyProjectManager({ workspace, evidence, chromium, expect }) {
  const receipt = { status: 'not-passed', checks: [], startedAt: new Date().toISOString() };
  const mark = name => receipt.checks.push(name);
  const database = join(evidence, 'independent-' + randomUUID() + '.sqlite');
  let server, browser;
  const request = async (method, path, body, status) => {
    const response = await fetch(server.url + path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status}: ${text.slice(0, 300)}`);
    if (status === 204) { assert.equal(text, ''); return; }
    const data = JSON.parse(text);
    if (status >= 400) assert.ok(typeof data.error === 'string' && data.error.length, 'Structured error required');
    return data;
  };
  try {
    const packageInfo = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'));
    assert.ok(packageInfo.scripts?.test, 'npm test script required');
    const tested = await exec('cmd.exe', ['/d', '/s', '/c', 'npm test'], { cwd: workspace, windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    await writeFile(join(evidence, 'generated-tests.log'), tested.stdout + '\n' + tested.stderr);
    assert.match(tested.stdout, /(?:tests\s+[1-9]\d*|[1-9]\d*\s+pass)/i, 'Must execute nonempty tests'); mark('generated npm test exits zero with nonempty tests');
    for (const name of ['README.md', 'README.zh-TW.md', 'README.en.md']) assert.ok((await readFile(join(workspace, name), 'utf8')).trim().length > 100, name);
    mark('three language README files');
    server = await startProjectServer(workspace, database, join(evidence, 'server-first.log'));
    assert.deepEqual(await request('GET', '/api/projects', undefined, 200), []);
    const a = await request('POST', '/api/projects', { name: "  发布计划 O'Reilly  ", description: '中文与引号测试' }, 201);
    const b = await request('POST', '/api/projects', { name: '另一个项目' }, 201);
    assert.ok(typeof a.id === 'string' && a.id.length && a.id !== b.id); assert.equal(a.name, "发布计划 O'Reilly");
    assert.equal((await request('PATCH', '/api/projects/' + a.id, { name: '重命名项目' }, 200)).description, '中文与引号测试'); mark('project create, list and partial update');
    for (const name of ['', '   ', 23, 'x'.repeat(121)]) await request('POST', '/api/projects', { name }, 400);
    await request('POST', '/api/projects', { name: '有效名称', description: 'x'.repeat(2001) }, 400);
    await request('PATCH', '/api/projects/' + a.id, { name: ' ' }, 400);
    const invalidJson = await fetch(server.url + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken', signal: AbortSignal.timeout(15000) });
    assert.equal(invalidJson.status, 400); assert.ok((await invalidJson.json()).error); mark('project validation and malformed JSON');
    const t1 = await request('POST', '/api/tasks', { projectId: a.id, title: '  第一项任务  ' }, 201);
    const t2 = await request('POST', '/api/tasks', { projectId: a.id, title: '第二项任务', status: 'done' }, 201);
    const t3 = await request('POST', '/api/tasks', { projectId: b.id, title: '其他项目任务', status: 'doing' }, 201);
    assert.equal(t1.title, '第一项任务'); assert.equal(t1.status, 'todo'); assert.equal(t1.projectId, a.id);
    for (const title of ['', ' ', 42, 'x'.repeat(201)]) await request('POST', '/api/tasks', { projectId: a.id, title }, 400);
    await request('POST', '/api/tasks', { projectId: a.id, title: 'bad', status: 'DONE' }, 400);
    await request('POST', '/api/tasks', { projectId: 'missing-' + randomUUID(), title: 'missing' }, 404);
    await request('PATCH', '/api/tasks/' + t1.id, { status: 'invalid' }, 400);
    assert.equal((await request('PATCH', '/api/tasks/' + t1.id, { title: '修改任务' }, 200)).status, 'todo');
    assert.equal((await request('PATCH', '/api/tasks/' + t1.id, { status: 'doing' }, 200)).title, '修改任务'); mark('task create, partial update and validation');
    const ids = rows => rows.map(row => row.id).sort();
    assert.deepEqual(ids(await request('GET', '/api/tasks?projectId=' + a.id, undefined, 200)), [t1.id, t2.id].sort());
    assert.deepEqual(ids(await request('GET', '/api/tasks?status=doing', undefined, 200)), [t1.id, t3.id].sort());
    assert.deepEqual(ids(await request('GET', '/api/tasks?projectId=' + a.id + '&status=done', undefined, 200)), [t2.id]);
    await request('GET', '/api/tasks?status=bad', undefined, 400);
    await request('PATCH', '/api/projects/missing', { name: 'missing' }, 404);
    await request('DELETE', '/api/tasks/missing', undefined, 404);
    await request('GET', '/api/missing', undefined, 404); mark('combined filters and missing resource errors');
    await server.stop(); server = await startProjectServer(workspace, database, join(evidence, 'server-restarted.log'));
    assert.equal((await readFile(database)).subarray(0, 16).toString(), 'SQLite format 3\0');
    assert.equal((await request('GET', '/api/projects', undefined, 200)).find(row => row.id === a.id).name, '重命名项目');
    assert.deepEqual(ids(await request('GET', '/api/tasks', undefined, 200)), [t1.id, t2.id, t3.id].sort()); mark('real SQLite and persistence across independent process restart');
    try { browser = await chromium.launch({ headless: false, channel: process.env.KUADE_ACCEPT_BROWSER_CHANNEL ?? 'msedge' }); }
    catch (error) { error.code = 'BROWSER_ENVIRONMENT'; throw error; }
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url);
    const uiProjectName = '界面验收 ' + randomUUID().slice(0, 8);
    await page.getByLabel('项目名称', { exact: true }).fill(uiProjectName);
    await page.getByRole('button', { name: '创建项目', exact: true }).click();
    await expect.poll(async () => (await request('GET', '/api/projects', undefined, 200)).some(row => row.name === uiProjectName)).toBe(true);
    const uiProject = (await request('GET', '/api/projects', undefined, 200)).find(row => row.name === uiProjectName);
    await page.getByLabel('选择项目', { exact: true }).selectOption(uiProject.id);
    const uiTitle = '<img src=x onerror="window.__injected=1">任务';
    await page.getByLabel('任务标题', { exact: true }).fill(uiTitle);
    await page.getByRole('button', { name: '添加任务', exact: true }).click();
    const row = page.getByTestId('task-row').filter({ hasText: uiTitle });
    await expect(row).toBeVisible(); assert.equal(await row.locator('img').count(), 0);
    await row.getByLabel('任务状态', { exact: true }).selectOption('done');
    await expect.poll(async () => (await request('GET', '/api/tasks?projectId=' + uiProject.id, undefined, 200))[0]?.status).toBe('done');
    await page.getByLabel('状态筛选', { exact: true }).selectOption('todo'); await expect(row).toHaveCount(0);
    await page.getByLabel('状态筛选', { exact: true }).selectOption('done'); await expect(row).toBeVisible();
    await page.reload(); await page.getByLabel('选择项目', { exact: true }).selectOption(uiProject.id); await page.getByLabel('状态筛选', { exact: true }).selectOption('done'); await expect(row).toBeVisible();
    assert.equal(await page.evaluate(() => window.__injected), undefined); assert.deepEqual(errors, []);
    await page.screenshot({ path: join(evidence, 'project-manager-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '添加任务', exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow layout horizontal overflow');
    await page.screenshot({ path: join(evidence, 'project-manager-narrow.png'), fullPage: true });
    mark('real browser project/task creation, status update, filter, reload, text escaping and narrow layout');
    await request('DELETE', '/api/tasks/' + t2.id, undefined, 204);
    await request('DELETE', '/api/projects/' + a.id, undefined, 204);
    const remaining = await request('GET', '/api/tasks', undefined, 200);
    assert.ok(!remaining.some(row => row.projectId === a.id)); assert.ok(remaining.some(row => row.id === t3.id)); mark('task deletion and project cascade preserves other project');
    Object.assign(receipt, { status: 'passed', database, serverPid: server.pid });
  } catch (error) {
    receipt.failureKind = error.code === 'BROWSER_ENVIRONMENT' ? 'environment' : 'verification';
    receipt.error = String(error.message).slice(0, 2000);
    if (error.stdout || error.stderr) await writeFile(join(evidence, 'generated-tests-failure.log'), String(error.stdout ?? '') + String(error.stderr ?? ''));
  } finally {
    if (browser) await browser.close();
    if (server) await server.stop();
    receipt.finishedAt = new Date().toISOString();
    await writeFile(join(evidence, 'verification.json'), JSON.stringify(receipt, null, 2));
  }
  return receipt;
}
