import { test, expect, _electron as electron } from '@playwright/test';
import { cp, copyFile, mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

// Replays preserved real-provider evidence in isolated profiles without credentials.
// No prompts or goal-resume actions are sent; the original session stays untouched.
const fixture = process.env.KUADE_HISTORY_FIXTURE;
const originalLog = process.env.KUADE_HISTORY_ORIGINAL_LOG;
for (const kind of ['interrupted', 'completed'] as const) test(`真实跨天会话界面：${kind}`, async () => {
  test.skip(!fixture || !originalLog, 'Requires retained real-provider session evidence');
  const root = resolve('.cache/history-ui-' + kind + '-' + randomUUID());
  await mkdir(root, { recursive: true });
  const profile = join(root, 'app');
  await expect(access(join(fixture!, 'app/harness/.credentials.yaml'))).rejects.toThrow();
  await cp(join(fixture!, 'app'), profile, { recursive: true });
  const sessionsRoot = join(profile, 'harness/sessions');
  const logs = (await readdir(sessionsRoot, { recursive: true })).filter(path => path.endsWith('session.v4.jsonl.zstd'));
  expect(logs).toHaveLength(1);
  const digest = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
  const sourceLog = join(fixture!, 'app/harness/sessions', logs[0]);
  const before = await digest(sourceLog);
  if (kind === 'interrupted') await copyFile(originalLog!, join(sessionsRoot, logs[0]));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)), KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.KUADE_TEST_EXECUTABLE;
  const app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], cwd: resolve('.'), env });
  const page = await app.firstWindow();
  const receipt: Record<string, unknown> = { status: 'not-passed', kind, fixture, originalLog, originalLogSha256: before, noModelExecution: true };
  try {
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    const tasks = await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items.filter((row: any) => !row.blank));
    expect(tasks).toHaveLength(1);
    await page.locator(`.recent-task[data-session-id="${tasks[0].sessionId}"]`).click();
    const progress = page.getByRole('region', { name: '任务进度' });
    if (kind === 'interrupted') {
      await expect(progress).toContainText('历史计划 1 / 4');
      await expect(progress).toContainText('已中断');
      await expect(page.getByText('等待恢复目标', { exact: true })).toBeVisible();
    } else {
      await expect(progress).toContainText('本轮结束');
      await expect(progress).toContainText('计划 3 / 4');
      await expect(progress).toContainText('计划仍有未勾选步骤');
      await expect(progress.getByRole('button', { name: '继续任务' })).toHaveCount(0);
      await expect(page.getByText('Agent 报告目标完成', { exact: true })).toBeVisible();
    }
    await progress.getByText('查看步骤计划', { exact: false }).click();
    await expect(progress.locator('li')).toHaveCount(4);
    await expect(progress).not.toContainText('尚无步骤计划');
    await page.screenshot({ path: join(root, 'verified.png'), animations: 'disabled', timeout: 30000 });
    const task = (await page.evaluate(async () => (await window.kuade.call('session/list', { _request: {} })).items)).find((row: any) => row.sessionId === tasks[0].sessionId);
    expect(task.running).toBe(false);
    expect(await digest(sourceLog)).toBe(before);
    Object.assign(receipt, { status: 'passed', sessionId: tasks[0].sessionId, progress: await progress.innerText(), originalUnchanged: true });
  } finally {
    await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    await app.close(); console.log('历史会话 UI 验收：', root);
  }
});
