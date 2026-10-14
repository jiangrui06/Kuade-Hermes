import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runHandoff, writeJson, type HandoffManifest } from '../../src/iteration/handoff';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

for (const scenario of ['healthy', 'wrong-version']) test(`真实打包桌面：${scenario} 版本切换与原生窗口`, async () => {
  test.skip(!process.env.KUADE_ITERATION_ARTIFACT); test.setTimeout(180000);
  const artifact = JSON.parse(await readFile(process.env.KUADE_ITERATION_ARTIFACT!, 'utf8'));
  const root = resolve('.cache/iteration-rollback-' + randomUUID()); await mkdir(root, { recursive: true });
  const profile = join(root, 'app'); const id = randomUUID();
  const previous = { executable: artifact.executable, cwd: dirname(artifact.executable), args: [], version: artifact.version, sha256: artifact.sha256, resourcesSha256: artifact.resourcesSha256 };
  // A real exited process satisfies the old-process gate; no liveness stub.
  const old = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true, stdio: 'ignore' });
  await new Promise<void>((done, reject) => { old.once('close', () => done()); old.once('error', reject); });
  const manifest: HandoffManifest = { schema: 1, id, token: randomUUID(), oldPid: old.pid!, userData: profile, candidateSource: dirname(dirname(dirname(artifact.executable))), previous, candidate: { ...previous, version: scenario === 'healthy' ? artifact.version : '999.0.0' }, timeoutMs: 20000 };
  const file = join(profile, 'updates', id, 'handoff.json'); await writeJson(file, manifest);
  const receipt: any = { status: 'not-passed' }; let pid: number | undefined;
  try {
    const result = await runHandoff(file); pid = result.pid;
    expect(result.status).toBe(scenario === 'healthy' ? 'completed' : 'rolled-back'); expect(result.version).toBe(artifact.version);
    const health = JSON.parse(await readFile(join(dirname(file), scenario === 'healthy' ? 'candidate-health.json' : 'previous-health.json'), 'utf8'));
    expect(health).toMatchObject({ id, pid, stage: 'ready', version: artifact.version });
    const transport = new StdioClientTransport({ command: resolve('resources/computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'], stderr: 'pipe' });
    const client = new Client({ name: 'kuade-rollback-acceptance', version: '1.0.0' });
    try {
      await client.connect(transport);
      const state = await client.callTool({ name: 'get_app_state', arguments: { app: String(pid) } }, undefined, { timeout: 60000 });
      await writeFile(join(root, 'native-observation.json'), JSON.stringify({ ...state, content: (state.content as any[]).filter(row => row.type !== 'image') }, null, 2));
      expect(state.isError).not.toBe(true);
      expect((state.structuredContent as any)?.desktop_observation?.pid).toBe(pid);
      const text = (state.content as any[]).filter(row => row.type === 'text').map(row => row.text).join('\n');
      await writeFile(join(root, 'restored-window.txt'), text);
      for (const item of state.content as any[]) if (item.type === 'image') await writeFile(join(root, 'restored-window.png'), Buffer.from(item.data, 'base64'));
      expect(text).toContain('Kuade');
      if (scenario === 'healthy') {
        const target = /Observed target: (window:\d+:\d+)\./.exec(text)?.[1]; expect(target).toBeTruthy();
        const pressed = await client.callTool({ name: 'press_key', arguments: { app: target, key: 'ctrl+shift+i' } }, undefined, { timeout: 60000 });
        const after = (pressed.content as any[]).filter(row => row.type === 'text').map(row => row.text).join('\n');
        await writeFile(join(root, 'shortcut-state.txt'), after);
        for (const item of pressed.content as any[]) if (item.type === 'image') await writeFile(join(root, 'shortcut-window.png'), Buffer.from(item.data, 'base64'));
        expect(pressed.isError).not.toBe(true); expect(after).toContain('让 Kuade');
      }
    } finally { await client.close(); await transport.close(); }
    receipt.status = 'passed'; receipt.result = result;
  } catch (error) { receipt.error = String(error); throw error; }
  finally {
    if (pid) await new Promise<void>(done => { const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); child.once('close', () => done()); child.once('error', () => done()); });
    await writeFile(join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
    console.log('Rollback evidence:', root);
  }
});
