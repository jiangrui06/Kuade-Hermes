// Baseline-owned startup gate. No model configuration or user credentials are copied.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const [executableArgument, version, evidenceArgument, savedVersionArgument] = process.argv.slice(2);
assert.ok(executableArgument && version && evidenceArgument, 'Expected executable, version and evidence directory');
const executable = await realpath(executableArgument);
const evidence = resolve(evidenceArgument);
await mkdir(evidence, { recursive: true });
const receipt = { status: 'not-passed', executable, expectedVersion: version, credentialsCopied: false };
let app, page;
try {
  for (let directory = dirname(executable);;) {
    assert.equal(existsSync(join(directory, 'node_modules')), false, 'Package has ancestor node_modules: ' + directory);
    const parent = dirname(directory); if (parent === directory) break;
    directory = parent;
  }
  const profile = await mkdtemp(join(evidence, 'startup-profile-'));
  receipt.profile = profile;
  let savedVersion;
  if (savedVersionArgument) {
    savedVersion = await readFile(resolve(savedVersionArgument));
    const entry = JSON.parse(savedVersion.toString('utf8'));
    assert.equal(entry.status, 'completed');
    const { gt } = createRequire(resolve('package.json'))('semver');
    assert.ok(gt(version, entry.launch.version), 'Regression requires an older saved version');
    assert.equal(createHash('sha256').update(await readFile(entry.launch.executable)).digest('hex'), entry.launch.sha256, 'Saved version must be a real intact executable');
    await writeFile(join(profile, 'active-version.json'), savedVersion);
    receipt.savedVersion = entry.launch.version;
  }
  const env = { ...process.env, KUADE_USER_DATA: profile };
  for (const key of Object.keys(env)) if (/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/.test(key) || /^(DSH_|DEEPSEEK_|OPENAI_|ANTHROPIC_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete env[key];
  const { _electron: electron, expect } = createRequire(resolve('package.json'))('@playwright/test');
  app = await electron.launch({ executablePath: executable, args: [], cwd: dirname(executable), env, timeout: 30000 });
  page = await app.firstWindow({ timeout: 30000 });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  await page.waitForFunction(() => !!window.kuade, undefined, { timeout: 30000 });
  const deadline = Date.now() + 130000;
  while (true) {
    const state = await page.evaluate(() => window.kuade.status());
    if (state.phase === 'ready') break;
    if (state.phase === 'error' || Date.now() >= deadline) throw new Error('Candidate runtime did not start: ' + state.message);
    await new Promise(done => setTimeout(done, 250));
  }
  await expect(page.getByText('本机运行', { exact: true })).toBeVisible();
  receipt.application = await page.evaluate(() => window.kuade.call('app/info'));
  assert.equal(receipt.application.version, version); assert.equal(receipt.application.packaged, true);
  if (savedVersion) {
    assert.deepEqual(await readFile(join(profile, 'active-version.json')), savedVersion);
    receipt.olderPointerPreserved = true;
    receipt.manualUpgradeStayedOnNewVersion = true;
  }
  receipt.pid = await app.evaluate(() => process.pid);
  const sessions = await page.evaluate(() => window.kuade.call('session/list', { _request: {} }));
  assert.ok(Array.isArray(sessions.items));
  const settings = await page.evaluate(() => window.kuade.call('settings/describe'));
  assert.ok(settings.namespaces.some(item => item.ns === 'llm-pi-ai'));
  const native = await page.evaluate(() => window.kuade.call('extensions/computer'));
  assert.equal(await realpath(native.command), await realpath(join(dirname(executable), 'resources/computer/qwen-computer-use.exe')));
  await page.screenshot({ path: join(evidence, 'packaged-startup.png') });
  receipt.status = 'passed';
} catch (error) {
  receipt.error = String(error.message).replace(/(Bearer\s+|token=)\S+/gi, '$1[redacted]').slice(0, 1200);
  process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'packaged-startup-failure.png') }).catch(() => {});
} finally {
  if (app) {
    try { await app.close(); receipt.closed = true; }
    catch (error) { receipt.closed = false; receipt.status = 'not-passed'; receipt.closeError = String(error.message).slice(0, 400); process.exitCode = 1; }
  }
  await writeFile(join(evidence, 'packaged-startup.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, version, evidence, error: receipt.error }));
}
