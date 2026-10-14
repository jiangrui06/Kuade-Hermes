import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, appendFile } from 'node:fs/promises';
import type { RuntimeEvent, RuntimeState } from '../shared/contracts';
import { HarnessRpc } from './rpc';
import { HarnessStreams } from './streams';
import { redactLog, validateEndpoint } from './policy';
import { ExtensionsStore } from './extensions';

const require = createRequire(import.meta.url);
export const HARNESS_VERSION = '0.2.0-rc.2';
export function runtimeEnvironment(parent: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  const result = { ...parent };
  // Product credentials come from its own settings, never another agent's environment.
  for (const key of Object.keys(result)) {
    if (/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/.test(key) || /^(DSH_|DEEPSEEK_|OPENAI_|ANTHROPIC_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete result[key];
  }
  return { ...result, DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1', NO_COLOR: '1' };
}
export class RuntimeSupervisor {
  private child?: ChildProcess;
  private rpc?: HarnessRpc;
  private streams?: HarnessStreams;
  private pending?: Promise<void>;
  private stopping = false;
  state: RuntimeState = { phase: 'stopped', message: '引擎尚未启动', version: HARNESS_VERSION };
  constructor(private home: string, private emit: (event: RuntimeEvent) => void, private executable = process.execPath) {}
  private update(phase: RuntimeState['phase'], message: string): void { this.state = { phase, message, version: HARNESS_VERSION }; this.emit({ kind: 'state', state: this.state }); }
  start(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.launch().catch(error => {
      this.update('error', redactLog(error instanceof Error ? error.message : String(error)));
      throw error;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async launch(): Promise<void> {
    if (this.child) throw new Error('引擎进程仍在运行');
    this.stopping = false;
    this.update('starting', '正在启动本地引擎…');
    await mkdir(this.home, { recursive: true });
    const patchPath = await new ExtensionsStore(this.home).preparePatch();
    let entry = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js');
    entry = entry.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    const child = spawn(this.executable, [entry, '--profile', 'web', '--patch', patchPath, '--no-open', '--host', '127.0.0.1', '--port', '0'], {
      cwd: this.home, env: runtimeEnvironment(process.env, this.home), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    let tail = '';
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      this.rpc = undefined; this.streams?.close(); this.streams = undefined;
      this.update(this.stopping ? 'stopped' : 'error', this.stopping ? '引擎已停止' : `引擎退出 (${code ?? 'signal'})，任务记录仍保存在本机`);
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`引擎启动超时。${tail.slice(-1000)}`)), 120_000);
        const done = (error?: Error, url?: string) => { clearTimeout(timeout); child.off('error', onError); child.off('exit', onExit); error ? reject(error) : resolve(url!); };
        const onError = (error: Error) => done(error);
        const onExit = (code: number | null) => done(new Error(`引擎启动失败 (${code})：${tail.split('\n').find(line => line.trim())?.slice(0,220) ?? '请检查本地运行日志'}`));
        child.once('error', onError); child.once('exit', onExit);
        let raw = '';
        let pendingLine = '';
        const read = (data: Buffer) => {
          const value = data.toString();
          raw = (raw + value).slice(-16000);
          tail = redactLog(raw).slice(-8000);
          pendingLine += value;
          const newline = pendingLine.lastIndexOf('\n');
          if (newline >= 0) {
            void appendFile(join(this.home, 'runtime.log'), redactLog(pendingLine.slice(0, newline + 1))).catch(() => {});
            pendingLine = pendingLine.slice(newline + 1);
          }
          if (pendingLine.length > 32000) pendingLine = '';
          const match = raw.match(/https?:\/\/127\.0\.0\.1:\d+\/?\?token=[^\s\x1b]+/);
          if (match) done(undefined, match[0]);
        };
        child.stdout?.on('data', read); child.stderr?.on('data', read);
      });
      const parsed = new URL(url);
      const response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      const cookies = response.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
      if (!cookies || ![302, 303].includes(response.status)) throw new Error('本地引擎身份验证失败');
      this.rpc = new HarnessRpc(parsed.origin, cookies);
      this.streams = new HarnessStreams(parsed.origin, cookies, this.emit);
      this.streams.connect();
      this.update('ready', '本地引擎已就绪');
    } catch (error) {
      await this.stop();
      this.update('error', redactLog(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }
  async call(endpoint: string, args: Record<string, unknown> = {}): Promise<any> {
    validateEndpoint(endpoint);
    if (!this.rpc) throw new Error('本地引擎尚未就绪');
    return this.rpc.call(endpoint, args);
  }
  subscribe(id: string, endpoint: string, args: Record<string, unknown> = {}): void {
    validateEndpoint(endpoint, true);
    if (!this.streams) throw new Error('本地引擎尚未就绪');
    this.streams.subscribe(id, endpoint, args);
  }
  unsubscribe(id: string): void { this.streams?.unsubscribe(id); }
  async stop(): Promise<void> {
    this.stopping = true; this.streams?.close(); this.streams = undefined; this.rpc = undefined;
    const child = this.child;
    if (!child || !child.pid || child.exitCode !== null) { this.child = undefined; return; }
    await new Promise<void>(resolve => {
      // Terminate the owned process tree on Windows: killing only its parent can orphan MCP servers and jobs.
      const killTree = () => {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.on('error', () => child.kill());
        } else child.kill('SIGKILL');
      };
      const timer = setTimeout(() => {
        killTree();
      }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      if (process.platform === 'win32') killTree();
      else child.kill('SIGTERM');
    });
  }
}
