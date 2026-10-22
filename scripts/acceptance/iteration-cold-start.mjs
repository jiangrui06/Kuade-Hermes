// Follow up a completed real iteration through its original packaged entry point.
// No credentials are copied and no installation or global process termination is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
const require = createRequire(resolve('package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const exec = promisify(execFile);
const [rootArgument] = process.argv.slice(2);
assert.ok(rootArgument, 'Expected completed real-iteration evidence directory');
const root = resolve(rootArgument);
const initial = JSON.parse(await readFile(join(root, 'acceptance.json'), 'utf8'));
assert.equal(initial.status, 'passed');
assert.equal(initial.applicationBefore?.packaged, true);
assert.equal(initial.scenario, 'task-history');
const profile = join(root, 'app');
const active = JSON.parse(await readFile(join(profile, 'active-version.json'), 'utf8'));
assert.equal(active.status, 'completed');
assert.equal(resolve(active.launch.executable), resolve(initial.artifact.executable));
const evidence = join(root, 'cold-start'); await mkdir(evidence);
const receipt = { status: 'not-passed', originalEntry: initial.executable, candidate: initial.artifact.executable, expectedVersion: initial.artifact.version, credentialsCopied: false, startedAt: Date.now() };
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
assert.equal(await hash(initial.executable), initial.executableSha256);
assert.equal(await hash(initial.artifact.executable), initial.artifact.sha256);
const env = { ...process.env, KUADE_USER_DATA: profile, KUADE_ACCEPT_CANDIDATE: initial.artifact.executable };
for (const key of Object.keys(env)) if (/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/.test(key) || /^(DSH_|DEEPSEEK_|OPENAI_|ANTHROPIC_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete env[key];
const candidateProcesses = async () => {
  // The packaged runtime reuses Kuade.exe in RUN_AS_NODE mode for .js workers.
  // Exclude those workers as well as Chromium renderer/utility processes.
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', 'ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter "Name=\'Kuade.exe\'" | Where-Object { $_.ExecutablePath -eq $env:KUADE_ACCEPT_CANDIDATE -and $_.CommandLine -notmatch \'--type=|\\.m?js(?:"|\\s|$)\' } | Select-Object ProcessId,ExecutablePath)'], { env, windowsHide: true });
  return JSON.parse(stdout);
};
let launcher, client, transport, ownedPid;
try {
  assert.deepEqual(await candidateProcesses(), [], 'Candidate is already running; cold-start proof requires a stopped application');
  launcher = spawn(initial.executable, [], { cwd: dirname(initial.executable), env, stdio: 'ignore', windowsHide: true });
  let launchError; launcher.on('error', error => { launchError = error; });
  receipt.launcherPid = launcher.pid;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    const rows = await candidateProcesses();
    assert.ok(rows.length <= 1, 'Unexpected duplicate candidate main processes');
    if (rows.length === 1) { ownedPid = rows[0].ProcessId; break; }
    await new Promise(done => setTimeout(done, 1500));
  }
  assert.ok(ownedPid, 'Original entry did not launch the verified candidate');
  receipt.candidatePid = ownedPid;
  assert.notEqual(ownedPid, initial.result.pid, 'Expected a newly launched process');
  client = new Client({ name: 'kuade-cold-start-acceptance', version: '1.0.0' });
  transport = new StdioClientTransport({ command: join(dirname(initial.artifact.executable), 'resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
  await client.connect(transport);
  let target, text, lastState;
  const observe = async app => {
    const state = await client.callTool({ name: 'get_app_state', arguments: { app } }, undefined, { timeout: 60000 });
    assert.ok(!state.isError);
    assert.equal(state.structuredContent?.desktop_observation?.pid, ownedPid);
    return { state, text: state.content.filter(row => row.type === 'text').map(row => row.text).join('\n') };
  };
  const readyDeadline = Date.now() + 130000;
  while (Date.now() < readyDeadline) {
    try {
      ({ state: lastState, text } = await observe(String(ownedPid)));
      target = text.match(/Observed target: (window:\d+:\d+)\./)?.[1];
      if (target && text.includes('本机运行')) break;
    } catch { /* The new window may not have appeared yet. */ }
    await new Promise(done => setTimeout(done, 1000));
  }
  assert.ok(target && text?.includes('本机运行'), 'Candidate runtime did not become ready');
  assert.ok(text.includes(initial.artifact.version), 'Native view does not show the candidate version');
  assert.ok(!(await client.callTool({ name: 'press_key', arguments: { app: target, key: 'ctrl+shift+h' } }, undefined, { timeout: 60000 })).isError);
  const featureDeadline = Date.now() + 30000;
  while (Date.now() < featureDeadline) {
    ({ state: lastState, text } = await observe(target));
    if (text.includes('搜索任务') && text.includes('筛选任务')) break;
    await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(text.includes('搜索任务') && text.includes('筛选任务'), 'New shortcut did not survive a cold start through the old entry');
  await writeFile(join(evidence, 'native-state.txt'), text);
  for (const content of lastState.content) if (content.type === 'image') await writeFile(join(evidence, 'desktop.png'), Buffer.from(content.data, 'base64'));
  receipt.launcherExitCode = launcher.exitCode;
  assert.equal(launcher.exitCode, 0, 'Old entry did not exit successfully after redirect');
  receipt.newFeatureAfterColdStart = true;
  receipt.status = 'passed';
} catch (error) {
  receipt.error = String(error.message).slice(0, 1200); process.exitCode = 1;
} finally {
  await client?.close().catch(() => {}); await transport?.close().catch(() => {});
  if (ownedPid) {
    const owned = (await candidateProcesses()).find(row => row.ProcessId === ownedPid);
    if (owned) await exec('taskkill', ['/PID', String(ownedPid), '/T', '/F'], { windowsHide: true }).catch(error => { receipt.cleanupError = String(error.message).slice(0, 300); });
    receipt.closed = !(await candidateProcesses()).some(row => row.ProcessId === ownedPid);
    if (!receipt.closed) { receipt.status = 'not-passed'; process.exitCode = 1; }
  }
  receipt.finishedAt = Date.now();
  await writeFile(join(evidence, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
