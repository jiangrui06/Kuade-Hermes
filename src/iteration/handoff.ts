import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildEnvironment } from './process';
import { resourcesHash } from './artifact';

const launchSchema = z.object({ executable: z.string().refine(isAbsolute), args: z.array(z.string()), cwd: z.string().refine(isAbsolute), version: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), resourcesSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export const handoffSchema = z.object({
  schema: z.literal(1), id: z.string().uuid(), token: z.string().min(32), oldPid: z.number().int().positive(),
  userData: z.string().refine(isAbsolute), candidateSource: z.string().refine(isAbsolute),
  previous: launchSchema, candidate: launchSchema,
  timeoutMs: z.number().int().min(100).max(300000).default(150000),
});
export type HandoffManifest = z.infer<typeof handoffSchema>;
export interface BootReceipt { id: string; token: string; pid: number; version: string; stage: 'starting' | 'ready'; at: number }
export interface HandoffResult { id: string; status: 'completed' | 'rolled-back' | 'failed'; at: number; pid?: number; version?: string; reason?: string }
export const executableHash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(temporary, path);
}
export function processAlive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
const sleep = (milliseconds: number) => new Promise<void>(done => setTimeout(done, milliseconds));
async function stopOwned(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>(done => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { child.kill(); done(); }); killer.once('close', () => done());
    });
  } else child.kill('SIGTERM');
  const deadline = Date.now() + 5000;
  while (processAlive(child.pid) && Date.now() < deadline) await sleep(50);
  if (processAlive(child.pid)) throw new Error('候选进程尚未退出，保留旧版本，等待处理');
}
/** External watchdog survives the old app's exit. It owns candidate/rollback PIDs. */
export async function runHandoff(manifestPath: string, options: { pollMs?: number; settleMs?: number; waitForOld?: (pid: number) => Promise<void> } = {}): Promise<HandoffResult> {
  const manifest = handoffSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const root = dirname(manifestPath); const resultPath = join(root, 'result.json');
  const activePath = join(manifest.userData, 'active-version.json');
  let previousActive: unknown;
  try { previousActive = JSON.parse(await readFile(activePath, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let published = false;
  const poll = options.pollMs ?? 250; const settle = options.settleMs ?? 1500;
  let child: ChildProcess | undefined;
  const launch = async (role: 'candidate' | 'previous') => {
    const spec = manifest[role];
    if (await executableHash(spec.executable) !== spec.sha256) throw new Error(`${role} 程序指纹与验证记录不符`);
    if (spec.resourcesSha256 && await resourcesHash(join(dirname(spec.executable), 'resources')) !== spec.resourcesSha256) throw new Error(`${role} 应用资源与构建记录不符`);
    child = spawn(spec.executable, [...spec.args, '--kuade-handoff=' + manifestPath, '--kuade-handoff-role=' + role], {
      cwd: spec.cwd, env: { ...buildEnvironment(process.env), KUADE_USER_DATA: manifest.userData },
      // This is the user's desktop app, not the background watchdog. STARTF_USESHOWWINDOW
      // with SW_HIDE can suppress Electron's first native window on Windows.
      detached: true, windowsHide: false, stdio: 'ignore',
    });
    const owned = child; let launchError: Error | undefined;
    owned.once('error', error => { launchError = error; });
    owned.unref();
    await writeJson(join(root, role + '-process.json'), { pid: owned.pid, at: Date.now() });
    const deadline = Date.now() + manifest.timeoutMs;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (owned.exitCode !== null || owned.signalCode !== null) throw new Error(`${role} 在健康检查前退出`);
      let receipt: BootReceipt | undefined;
      try { receipt = JSON.parse(await readFile(join(root, role + '-health.json'), 'utf8')); } catch { /* A missing/partial receipt never proves readiness. */ }
      if (receipt?.id === manifest.id && receipt.token === manifest.token && receipt.pid === owned.pid && receipt.version === spec.version && receipt.stage === 'ready') {
        await sleep(settle);
        if (!owned.pid || !processAlive(owned.pid)) throw new Error(`${role} 就绪后立即退出`);
        return owned.pid;
      }
      await sleep(poll);
    }
    throw new Error(`${role} 启动健康检查超时`);
  };
  const finish = async (result: HandoffResult) => { await writeJson(resultPath, result); return result; };
  // The original app waits for this acknowledgement before quitting.
  await writeJson(join(root, 'watchdog-ready.json'), { id: manifest.id, pid: process.pid, at: Date.now() });
  if (options.waitForOld) await options.waitForOld(manifest.oldPid);
  else {
    const deadline = Date.now() + 30000;
    while (processAlive(manifest.oldPid) && Date.now() < deadline) await sleep(poll);
    if (processAlive(manifest.oldPid)) return finish({ id: manifest.id, status: 'failed', at: Date.now(), reason: '原程序未退出，本轮没有启动候选版本' });
  }
  try {
    const pid = await launch('candidate');
    const result: HandoffResult = { id: manifest.id, status: 'completed', at: Date.now(), pid, version: manifest.candidate.version };
    await writeJson(activePath, { ...result, launch: manifest.candidate, source: manifest.candidateSource }); published = true;
    return finish(result);
  } catch (error) {
    const reason = (error as Error).message;
    try {
      if (published) {
        if (previousActive === undefined) await unlink(activePath);
        else await writeJson(activePath, previousActive);
      }
      if (child) await stopOwned(child);
      const pid = await launch('previous');
      return finish({ id: manifest.id, status: 'rolled-back', at: Date.now(), pid, version: manifest.previous.version, reason });
    } catch (rollbackError) {
      if (child) await stopOwned(child).catch(() => {});
      return finish({ id: manifest.id, status: 'failed', at: Date.now(), reason: `${reason}；旧版本启动：${(rollbackError as Error).message}` });
    }
  }
}
