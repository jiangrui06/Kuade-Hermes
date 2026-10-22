import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const enabled = process.platform === 'win32' && process.env.KUADE_TEST_WINDOWS_TASK === '1';
const helper = fileURLToPath(new URL('./windows-task-host.ps1', import.meta.url));
const powershell = join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));

test('OS-owned acceptance host preserves real zero/nonzero child exit codes and rejects an invalid manifest', { skip: !enabled, timeout: 360000 }, async () => {
  assert.ok(process.env.KUADE_TASK_HOST_EXAMPLE, 'Expected a credential-free startup manifest');
  const example = await readJson(process.env.KUADE_TASK_HOST_EXAMPLE);
  assert.equal(example.kind, 'startup');
  const results = [];
  for (const succeeds of [true, false]) {
    const id = randomUUID(); const root = resolve('D:/Kuade-acceptance/host-' + id);
    await mkdir(root);
    const taskName = 'Kuade-Acceptance-' + id;
    const spec = { ...example, taskName, executable: succeeds ? example.executable : example.node };
    const manifest = join(root, 'manifest.json');
    await writeFile(manifest, JSON.stringify(spec, null, 2));
    let state;
    try {
      // Registration exits before its scheduler-owned child finishes.
      await exec(powershell, ['-NoProfile', '-NonInteractive', '-File', helper, '-Mode', 'Start', '-Manifest', manifest], { windowsHide: true });
      const deadline = Date.now() + 165000;
      while (Date.now() < deadline) {
        state = await readJson(join(root, 'host-state.json')).catch(() => undefined);
        if (state?.finishedAt) break;
        await new Promise(done => setTimeout(done, 1000));
      }
      assert.ok(state?.finishedAt, 'Scheduled acceptance did not finish');
      assert.equal(state.status, succeeds ? 'passed' : 'not-passed');
      assert.equal(state.exitCode, succeeds ? 0 : 1);
      const startup = await readJson(join(root, 'startup/packaged-startup.json'));
      assert.equal(startup.status, succeeds ? 'passed' : 'not-passed');
      const { stdout } = await exec(powershell, ['-NoProfile', '-Command', `(Get-ScheduledTaskInfo -TaskName '${taskName}').LastTaskResult`], { windowsHide: true });
      assert.equal(Number(stdout.trim()), succeeds ? 0 : 1);
      results.push({ kind: succeeds ? 'valid-desktop' : 'wrong-executable', evidence: root, host: state, startup, schedulerExitCode: Number(stdout.trim()) });
    } finally {
      if (!state?.finishedAt) await exec(powershell, ['-NoProfile', '-Command', `Stop-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue`], { windowsHide: true });
      await exec(powershell, ['-NoProfile', '-Command', `Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false -ErrorAction SilentlyContinue`], { windowsHide: true });
    }
  }
  const invalidId = randomUUID(); const invalidRoot = resolve('D:/Kuade-acceptance/host-' + invalidId);
  await mkdir(invalidRoot);
  const invalidManifest = join(invalidRoot, 'manifest.json');
  await writeFile(invalidManifest, JSON.stringify({ ...example, kind: 'unsupported', taskName: 'Kuade-Acceptance-' + invalidId }));
  await assert.rejects(exec(powershell, ['-NoProfile', '-NonInteractive', '-File', helper, '-Mode', 'Run', '-Manifest', invalidManifest], { windowsHide: true }), error => error.code === 1);
  await assert.rejects(readFile(join(invalidRoot, 'host-state.json')), { code: 'ENOENT' });
  assert.equal((await readJson(join(invalidRoot, 'bootstrap-error.json'))).status, 'not-passed');
  const evidence = resolve(process.env.KUADE_TASK_HOST_EXAMPLE, '..', 'host-integration.json');
  await writeFile(evidence, JSON.stringify({ status: 'passed', results, invalidManifestRejected: true, temporaryTasksRemoved: true }, null, 2));
  console.log('Windows host integration evidence: ' + evidence);
});
