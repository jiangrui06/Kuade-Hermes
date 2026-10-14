import { spawn } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { redactLog } from '../runtime/policy';
import type { VerificationStep } from '../shared/iteration';

export interface ProcessSpec { name: string; executable: string; args: string[]; cwd: string; log: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
export class StepError extends Error {
  constructor(message: string, readonly receipt: VerificationStep) { super(message); }
}
export function buildEnvironment(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...parent };
  for (const key of Object.keys(env)) if (/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/.test(key) || /^(DSH_|DEEPSEEK_|OPENAI_|ANTHROPIC_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$|KUADE_USER_DATA$)/.test(key)) delete env[key];
  return env;
}
/** Drain both streams, persist exit status, and cancel only this owned process tree. */
export async function runStep(spec: ProcessSpec, signal?: AbortSignal): Promise<VerificationStep> {
  signal?.throwIfAborted();
  await mkdir(dirname(spec.log), { recursive: true });
  const startedAt = Date.now(); await writeFile(spec.log, `Step: ${spec.name}\nStarted: ${new Date(startedAt).toISOString()}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, { cwd: spec.cwd, env: spec.env ?? buildEnvironment(process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logQueue = Promise.resolve(); let failure: Error | undefined; let settled = false;
    // Redact complete lines so a split token never escapes into an intermediate write.
    const pending = new Map<string, string>();
    const consume = (stream: string, chunk: string, flush = false) => {
      const value = (pending.get(stream) ?? '') + chunk;
      const end = flush ? value.length : value.lastIndexOf('\n') + 1;
      pending.set(stream, value.slice(end).slice(-32768));
      if (end) logQueue = logQueue.then(() => appendFile(spec.log, redactLog(value.slice(0, end)))).catch(error => { failure = error; stop(); });
    };
    child.stdout.on('data', data => consume('stdout', data.toString()));
    child.stderr.on('data', data => consume('stderr', data.toString()));
    const stop = () => {
      if (!child.pid || child.exitCode !== null) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill('SIGTERM');
    };
    const aborted = () => { failure = new Error('迭代已停止'); stop(); };
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
    const timer = setTimeout(() => { failure = new Error(`${spec.name} 执行超时`); stop(); }, spec.timeoutMs ?? 60 * 60 * 1000);
    const finish = async (code: number | null) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
      consume('stdout', '', true); consume('stderr', '', true);
      const receipt: VerificationStep = { name: spec.name, startedAt, finishedAt: Date.now(), exitCode: code, log: spec.log };
      try {
        await logQueue; await appendFile(spec.log, `\nExit: ${code ?? 'signal'}\n`);
        await writeFile(spec.log + '.json', JSON.stringify(receipt, null, 2));
      } catch (error) { reject(error); return; }
      if (failure || code !== 0) reject(new StepError(failure?.message ?? `${spec.name} 未通过（退出码 ${code ?? 'signal'}），请查看执行日志`, receipt));
      else resolve(receipt);
    };
    child.once('error', error => { failure = error; void finish(null); });
    child.once('close', code => { void finish(code); });
  });
}
