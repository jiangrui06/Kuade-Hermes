// Read-only contract acceptance against the actual pinned runtime, in a fresh product home.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const home = resolve('.cache/runtime-contract');
await mkdir(home, { recursive: true });
await writeFile(resolve(home, 'empty.patch.json'), '[]');
const env = { ...process.env, DSH_HOME: home, NO_COLOR: '1' };
for (const key of Object.keys(env)) if (/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/.test(key) || /^(DEEPSEEK_|OPENAI_|ANTHROPIC_|ELECTRON_|NODE_OPTIONS$)/.test(key)) delete env[key];
const child = spawn(process.execPath, [resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--patch', resolve(home, 'empty.patch.json'), '--no-open', '--host', '127.0.0.1', '--port', '0'], { env, cwd: home, windowsHide: true });
let log = '';
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Runtime startup timed out')), 120000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Runtime exited ${code}: ${log.slice(-3000)}`)); });
    const read = data => {
      log = (log + data).slice(-20000);
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+\/?\?token=[^\s\x1b]+/);
      if (match) { clearTimeout(timer); resolve(new URL(match[0])); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
  });
  const response = await fetch(url, { redirect: 'manual' });
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  console.log('Authentication status:', response.status, 'cookie:', !!cookie);
  const call = async (endpoint, args = {}) => {
    const rpcId = randomUUID();
    const result = await fetch(url.origin + '/api/' + endpoint, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }) });
    const body = await result.json();
    if (!body.result?.ok) throw new Error(endpoint + ': ' + JSON.stringify(body));
    return body.result.value;
  };
  const sessions = await call('session/list', { _request: {} });
  console.log('Session list:', sessions.items.length);
  const settings = await call('settings/describe');
  console.log('Provider settings:', settings.namespaces.some(value => value.ns === 'llm-pi-ai'));
  const catalog = await call('session/modelCatalog');
  console.log('Catalog keys:', Object.keys(catalog));
  const project = resolve('.cache/contract-project'); await mkdir(project, { recursive: true });
  const workspace = await call('workspace/create', { request: { path: project } });
  console.log('Workspace keys:', Object.keys(workspace.workspace));
  const session = await call('session/create', { request: { workspaceId: workspace.workspace.workspaceId, agentPreset: 'standard' } });
  console.log('Session created:', !!session.sessionId);
  console.log('Permission command:', await call('commands/execute', { agentId: session.sessionId, line: '/permission workspace-write', submittedAttachments: [] }));
} finally {
  await writeFile(resolve(home, 'acceptance.log'), log.replace(/([?&]token=)[^\s&]+/gi, '$1[redacted]'));
  child.kill();
}
