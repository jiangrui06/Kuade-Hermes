// Actual native input through the shipped MCP, on a dedicated disposable window only.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
if (process.platform !== 'win32') throw new Error('Requires an interactive Windows desktop');
const root = resolve('.cache/computer-' + randomUUID()); await mkdir(root, { recursive: true });
const title = 'Kuade MCP acceptance ' + randomUUID().slice(0, 8);
const marker = 'Kuade 中文桌面输入 ' + randomUUID().slice(0, 8);
const resultPath = resolve(root, 'input.txt');
const readyPath = resolve(root, 'ready.txt');
function environmentFingerprint() {
  const script = `function Hash-Environment($scope) { $items=[Environment]::GetEnvironmentVariables($scope); $rows=@($items.Keys | Sort-Object | ForEach-Object { [string]$_+'='+[string]$items[$_] }); $bytes=[Text.Encoding]::UTF8.GetBytes(($rows -join [char]0)); [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)) }; @{ User=(Hash-Environment 'User'); Machine=(Hash-Environment 'Machine') } | ConvertTo-Json -Compress`;
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Environment snapshot failed');
  return { ...JSON.parse(result.stdout), process: createHash('sha256').update(JSON.stringify(Object.entries(process.env).sort())).digest('hex') };
}
const before = environmentFingerprint();
const fixture = spawn('powershell.exe', ['-NoProfile', '-STA', '-File', resolve('tests/fixtures/computer-window.ps1'), '-ResultPath', resultPath, '-WindowTitle', title, '-ReadyPath', readyPath], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let fixtureError = ''; fixture.stderr.on('data', chunk => { fixtureError = (fixtureError + chunk).slice(-3000); });
const transport = new StdioClientTransport({ command: resolve('resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
const client = new Client({ name: 'kuade-native-acceptance', version: '1.0.0' });
const receipt = { status: 'not-passed', component: 'qwen_computer', marker, fixturePid: fixture.pid, steps: [], before };
let app = String(fixture.pid);
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  const text = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
  assert.ok(!result.isError, text.slice(0, 500));
  const observation = result.structuredContent?.desktop_observation;
  assert.equal(observation?.pid, fixture.pid, 'Observation must belong to the controlled fixture');
  assert.equal(observation?.window_title, title, 'Unexpected target window');
  const target = text.match(/Observed target: (window:\d+:\d+)\./)?.[1];
  assert.ok(target, 'Missing grounded window identity'); app = target;
  for (const item of result.content ?? []) if (item.type === 'image') await writeFile(resolve(root, `${receipt.steps.length}-${name}.png`), Buffer.from(item.data, 'base64'));
  receipt.steps.push({ name, text, target: app }); return text;
}
function element(text, name) {
  const lines = text.split('\n').filter(line => line.includes(name));
  const match = lines.find(line => /^\s*\d+\s/.test(line))?.match(/^\s*(\d+)\s/);
  assert.ok(match, `No current accessibility target: ${name}`); return match[1];
}
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 9);
  const deadline = Date.now() + 20000;
  while (!(await readFile(readyPath, 'utf8').catch(() => ''))) {
    if (fixture.exitCode !== null || Date.now() > deadline) throw new Error('Test window did not become ready: ' + fixtureError);
    await new Promise(done => setTimeout(done, 200));
  }
  let state = await call('get_app_state', { app });
  state = await call('click', { app, element_index: element(state, 'Acceptance input') });
  state = await call('type_text', { app, text: marker });
  assert.ok(state.includes(marker), 'Input not visible in returned state');
  state = await call('click', { app, element_index: element(state, 'Verify input') });
  assert.ok(state.includes('Accepted: ' + marker), 'Application postcondition not observed');
  assert.equal(await readFile(resultPath, 'utf8'), marker);
  receipt.status = 'passed';
} catch (error) { receipt.error = String(error.message); process.exitCode = 1; }
finally {
  await client.close(); await transport.close();
  if (fixture.pid && fixture.exitCode === null) fixture.kill();
  receipt.after = environmentFingerprint();
  if (Object.keys(receipt.before).some(key => receipt.before[key] !== receipt.after[key])) { receipt.status = 'not-passed'; receipt.environmentChanged = true; process.exitCode = 1; }
  await writeFile(resolve(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, error: receipt.error, evidence: root, environmentUnchanged: !receipt.environmentChanged, steps: receipt.steps.length }));
}
