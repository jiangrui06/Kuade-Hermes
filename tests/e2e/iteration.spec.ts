import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Opt in: fresh dependency installation, a full package and native input on an owned app.
// The provider is controlled; this does not certify external model reasoning.
test('自迭代：真实工具改源码、基线测试、打包、自动重启与新功能', async () => {
  test.skip(process.env.KUADE_LIVE_ITERATION !== '1'); test.setTimeout(1200000);
  const root = resolve('.cache/iteration-' + randomUUID()); await mkdir(root, { recursive: true });
  const profile = join(root, 'app');
  const original = await readFile('src/renderer/features/shortcuts.ts', 'utf8');
  const improved = original.replace("key === 'i'", "key === 'i' || key === 'u'");
  expect(improved).not.toBe(original);
  const sourceHash = createHash('sha256').update(original).digest('hex');
  let toolResult = false;
  const toolReplies: any[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'iteration-fixture' }] })); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    const tool = input.tools?.find((row: any) => row.function?.name === 'write');
    const result = input.messages.some((row: any) => row.role === 'tool' && row.tool_call_id === 'iteration-write');
    const read = input.messages.some((row: any) => row.role === 'tool' && row.tool_call_id === 'iteration-read');
    toolReplies.push(...input.messages.filter((row: any) => row.role === 'tool' && row.tool_call_id === 'iteration-write'));
    if (result) toolResult = true;
    const delta = tool && !read ? { tool_calls: [{ index: 0, id: 'iteration-read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ file_path: 'src/renderer/features/shortcuts.ts' }) } }] } : tool && !result ? { tool_calls: [{ index: 0, id: 'iteration-write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ file_path: 'src/renderer/features/shortcuts.ts', content: improved }) } }] } : { content: '增加了 Ctrl+Shift+U 打开自我迭代入口。由宿主独立验证。' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const item of [{ delta: { role: 'assistant' }, finish_reason: null }, { delta, finish_reason: null }, { delta: {}, finish_reason: 'tool_calls' in delta ? 'tool_calls' : 'stop' }]) response.write('data: ' + JSON.stringify({ id: 'iteration', object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, ...item }] }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), KUADE_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  let launchedPid: number | undefined;
  let journal: any;
  const receipt: any = { status: 'not-passed', model: 'controlled local provider', phases: [] };
  try {
    app = await electron.launch({ args: ['.'], cwd: resolve('.'), env });
    const oldPid = await app.evaluate(() => process.pid); const page = await app.firstWindow();
    await expect(page.getByText('本机运行', { exact: true })).toBeVisible({ timeout: 130000 });
    await page.getByRole('button', { name: '模型连接', exact: true }).click();
    await page.getByLabel('连接名称', { exact: true }).fill('自迭代验收');
    await page.getByLabel('API 地址', { exact: true }).fill(`http://127.0.0.1:${(server.address() as any).port}/v1`);
    await page.getByRole('checkbox', { name: 'iteration-fixture', exact: true }).check();
    await page.getByRole('button', { name: '保存连接' }).click();
    await expect(page.getByRole('status').filter({ hasText: '模型配置已保存' })).toBeVisible();
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }); }, resolve('.'));
    await page.getByRole('button', { name: /^自我迭代/ }).click();
    await page.getByRole('button', { name: '选择源码' }).click();
    await page.getByLabel('自迭代需求').fill('增加 Ctrl+Shift+U 打开自我迭代页面的快捷键。');
    await page.getByRole('button', { name: '开始迭代并自动更新' }).click();
    const deadline = Date.now() + 1000000;
    while (Date.now() < deadline) {
      try { journal = JSON.parse(await readFile(join(profile, 'iteration.json'), 'utf8')); } catch {}
      const phase = journal?.state.phase;
      if (phase && receipt.phases.at(-1)?.phase !== phase) { receipt.phases.push({ phase, at: Date.now() }); console.log('Self iteration:', phase, journal.state.message); }
      if (['failed', 'cancelled', 'rolled-back'].includes(phase)) throw new Error(journal.state.message + ' Evidence: ' + journal.state.evidence);
      if (phase === 'restarting' || phase === 'completed') break;
      await new Promise(done => setTimeout(done, 1000));
    }
    expect(journal?.state.phase).toMatch(/restarting|completed/);
    const update = join(profile, 'updates', journal.state.id);
    let result: any;
    await expect.poll(async () => { try { result = JSON.parse(await readFile(join(update, 'result.json'), 'utf8')); return result.status; } catch { return 'waiting'; } }, { timeout: 330000, intervals: [1000] }).toBe('completed');
    launchedPid = result.pid; expect(launchedPid).not.toBe(oldPid);
    await expect.poll(() => app!.process().exitCode).not.toBeNull(); app = undefined;
    expect(toolResult).toBe(true);
    expect(createHash('sha256').update(await readFile('src/renderer/features/shortcuts.ts')).digest('hex')).toBe(sourceHash);
    const steps = JSON.parse(await readFile(join(journal.state.evidence, 'verification.json'), 'utf8'));
    expect(steps.map((row: any) => row.name)).toEqual(['dependencies', 'typecheck', 'baseline-tests', 'desktop-build', 'electron-runtime', 'package', 'packaged-startup']);
    expect(steps.every((row: any) => row.exitCode === 0)).toBe(true);
    const transport = new StdioClientTransport({ command: resolve('resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
    const client = new Client({ name: 'kuade-iteration-acceptance', version: '1.0.0' });
    try {
      await client.connect(transport);
      const observe = await client.callTool({ name: 'get_app_state', arguments: { app: String(launchedPid) } }, undefined, { timeout: 60000 });
      await writeFile(join(root, 'native-observation.json'), JSON.stringify({ ...observe, content: (observe.content as any[]).filter(row => row.type !== 'image') }, null, 2));
      expect(observe.isError).not.toBe(true);
      const text = (observe.content as any[]).filter(row => row.type === 'text').map(row => row.text).join('\n');
      const target = /Observed target: (window:\d+:\d+)\./.exec(text)?.[1]; expect(target).toBeTruthy();
      expect((observe.structuredContent as any)?.desktop_observation?.pid).toBe(launchedPid);
      const pressed = await client.callTool({ name: 'press_key', arguments: { app: target, key: 'ctrl+shift+u' } }, undefined, { timeout: 60000 });
      expect(pressed.isError).not.toBe(true);
      const after = (pressed.content as any[]).filter(row => row.type === 'text').map(row => row.text).join('\n');
      await writeFile(join(root, 'native-state.txt'), after);
      for (const item of pressed.content as any[]) if (item.type === 'image') await writeFile(join(root, 'updated-desktop.png'), Buffer.from(item.data, 'base64'));
      expect(after).toContain('让 Kuade'); expect(after).toContain('自迭代需求');
      receipt.nativeTarget = target;
    } finally { await client.close(); await transport.close(); }
    receipt.status = 'passed'; receipt.result = result; receipt.verification = steps; receipt.sourceUnchanged = true;
  } catch (error) { receipt.error = String(error); throw error; }
  finally {
    if (app) await app.close().catch(() => {});
    if (!launchedPid && journal?.state?.id) { try { launchedPid = JSON.parse(await readFile(join(profile, 'updates', journal.state.id, 'candidate-process.json'), 'utf8')).pid; } catch {} }
    if (launchedPid) await new Promise<void>(done => { const child = spawn('taskkill', ['/PID', String(launchedPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); child.once('close', () => done()); child.once('error', () => done()); });
    receipt.candidate = journal?.state?.candidate; receipt.evidence = journal?.state?.evidence;
    await writeFile(join(root, 'tool-results.json'), JSON.stringify(toolReplies, null, 2));
    await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    await new Promise<void>(done => server.close(() => done()));
    console.log('Self iteration evidence:', root);
  }
});
