import { spawn } from 'node:child_process';
import { mkdir, readFile, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { IterationState, SourceSnapshot } from '../shared/iteration';
import { prepareSource } from './source';
import { verifyCandidate } from './verify';
import { buildEnvironment } from './process';
import { resourcesHash } from './artifact';
import { executableHash, writeJson, type HandoffManifest, type HandoffResult } from './handoff';

type Call = (endpoint: string, args?: Record<string, unknown>) => Promise<any>;
const inputSchema = z.object({ source: z.string().min(1), requirement: z.string().trim().min(1).max(20000), provider: z.string().min(1), model: z.string().min(1), effort: z.string().optional() });
type Input = z.infer<typeof inputSchema>;
interface RecordState { state: IterationState; input: Input; snapshot?: SourceSnapshot; afterSeq: number }
interface Options {
  userData: string; buildRoot: string; executable: string; appRoot: string; version: string; packaged: boolean;
  nativeResources: string; watchdog: string; call: Call;
  prepareModel(provider: string, model: string): Promise<any>;
  quit(): void;
}
const TERMINAL = new Set(['completed', 'rolled-back', 'failed', 'cancelled']);
export class IterationService {
  private record?: RecordState;
  private loaded = false;
  private loading?: Promise<void>;
  private active?: Promise<void>;
  private abort?: AbortController;
  private claiming = false;
  constructor(private options: Options) {}
  private get journal() { return join(this.options.userData, 'iteration.json'); }
  private async load() {
    if (this.loaded) return;
    return this.loading ??= (async () => {
      try { this.record = JSON.parse(await readFile(this.journal, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      this.loaded = true;
    })().finally(() => { this.loading = undefined; });
  }
  private async set(phase: IterationState['phase'], message: string) {
    if (!this.record) throw new Error('没有当前迭代');
    this.record.state = { ...this.record.state, phase, message, updatedAt: Date.now() };
    await writeJson(this.journal, this.record);
  }
  async status(): Promise<IterationState | null> {
    await this.load();
    if (this.record?.state.phase === 'restarting') {
      try {
        const result: HandoffResult = JSON.parse(await readFile(join(this.options.userData, 'updates', this.record.state.id, 'result.json'), 'utf8'));
        if (result.id === this.record.state.id && ['completed', 'rolled-back', 'failed'].includes(result.status)) await this.set(result.status, result.status === 'completed' ? `已更新至 ${result.version}，桌面与引擎启动验证通过` : result.reason ?? '版本启动未通过');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    } else if (this.record && !this.active && !this.claiming && !TERMINAL.has(this.record.state.phase)) {
      await this.set('failed', '上轮执行已中断，源码、任务和验证记录已保留；可在任务中继续改进后重新验证');
    }
    return this.record?.state ?? null;
  }
  get isRestarting() { return this.record?.state.phase === 'restarting'; }
  private launch(work: (signal: AbortSignal) => Promise<void>) {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.active = work(signal).catch(async error => {
      await this.set(signal.aborted ? 'cancelled' : 'failed', signal.aborted ? '本轮迭代已停止，候选源码和记录保留' : (error as Error).message);
    }).finally(() => { this.active = undefined; });
    // Journal I/O errors remain observable without an unhandled rejection in Electron.
    void this.active.catch(() => {});
  }
  async start(input: unknown): Promise<IterationState> {
    if (this.claiming) throw new Error('迭代正在准备');
    this.claiming = true;
    try {
      await this.load();
      if (this.active || this.isRestarting) throw new Error('已有迭代正在进行');
      if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('当前自迭代构建目标为 Windows x64');
      const value = inputSchema.parse(input);
      const info = await this.options.prepareModel(value.provider, value.model);
      if (value.effort && !info.reasoning?.efforts?.some((row: any) => row.id === value.effort)) throw new Error('所选模型没有声明此思考强度');
      await mkdir(this.options.buildRoot, { recursive: true });
      const space = await statfs(this.options.buildRoot);
      if (space.bavail * space.bsize < 3 * 1024 ** 3) throw new Error('构建磁盘可用空间不足 3 GiB，请先释放空间');
      const id = randomUUID(); const startedAt = Date.now(); const run = join(this.options.buildRoot, id);
      this.record = { input: value, afterSeq: -1, state: { id, phase: 'preparing', source: value.source, candidate: join(run, 'source'), requirement: value.requirement, startedAt, updatedAt: startedAt, baseVersion: this.options.version, targetVersion: '', message: '正在创建独立源码副本', evidence: join(run, 'evidence') } };
      await writeJson(this.journal, this.record);
      this.launch(async signal => {
        const snapshot = await prepareSource(value.source, run); signal.throwIfAborted();
        if (snapshot.baseVersion !== this.options.version) throw new Error(`源码版本 ${snapshot.baseVersion} 与当前应用 ${this.options.version} 不一致，请选择当前版本源码`);
        this.record!.snapshot = snapshot;
        Object.assign(this.record!.state, { baseVersion: snapshot.baseVersion, targetVersion: snapshot.targetVersion });
        const workspace = await this.options.call('workspace/create', { request: { path: snapshot.candidate } });
        const session = await this.options.call('session/create', { request: { workspaceId: workspace.workspace.workspaceId, agentPreset: 'standard' } });
        Object.assign(this.record!.state, { workspaceId: workspace.workspace.workspaceId, sessionId: session.sessionId });
        await this.options.call('commands/execute', { agentId: session.sessionId, line: '/permission danger-full-access', submittedAttachments: [] });
        await this.options.call('session/selectModel', { request: { sessionId: session.sessionId, provider: value.provider, model: value.model, ...(value.effort ? { reasoningEffort: value.effort } : {}) } });
        await this.set('coding', 'Agent 正在独立副本中改进 Kuade；可打开任务查看或补充要求');
        signal.throwIfAborted();
        await this.options.call('session/prompt', { request: { sessionId: session.sessionId, requestId: randomUUID(), mode: 'queue', clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, content: [{ type: 'text', text: this.prompt(value, snapshot) }] } });
        await this.waitForTask(signal); await this.verifyAndRestart(signal);
      });
      return this.record.state;
    } finally { this.claiming = false; }
  }
  private prompt(input: Input, snapshot: SourceSnapshot) {
    return `你正在通过 Kuade Harness 完成自身迭代。当前工作区是独立源码副本，版本已由宿主调整为 ${snapshot.targetVersion}。\n用户要求：${input.requirement}\n\n先理解现有模块，再实现完整需求，复用现成组件，补充必要测试，更新简体／繁体／英文文档。只修改当前源码副本，保持模块边界；不要修改原始项目、用户配置、基线证据、版本字段或主程序入口标识。保留现有验证门槛，不删减测试以取得通过。你可运行项目测试；结束后宿主仍会独立执行原始测试、构建和自动更新重启。不要自行启动安装器、结束 Kuade 或修改用户密钥。给出变更与验证结论；遇到依赖或不确定问题说明真实情况。`;
  }
  private async waitForTask(signal: AbortSignal) {
    const id = this.record!.state.sessionId!;
    while (true) {
      signal.throwIfAborted();
      const tasks = await this.options.call('session/list', { _request: {} });
      const task = tasks.items.find((row: any) => row.sessionId === id);
      if (!task) throw new Error('迭代会话不存在，已保留源码副本');
      if (!task.running && !task.blank) {
        const projection = await this.options.call('session/projections', { request: { sessionId: id } });
        const history = await this.options.call('session/page', { request: { address: { kind: 'session', sessionId: id }, throughSeq: projection.asOfSeq, maxMessages: 10 } });
        const last = history.records.map((row: any) => row.event).findLast((event: any) => (event.type === 'turn/start' || event.type === 'turn/end') && event.seq > this.record!.afterSeq);
        if (last?.type === 'turn/end') {
          const reason = last.data?.reason?.kind;
          if (reason !== 'completed') throw new Error(`Agent 本轮状态为 ${reason ?? 'unknown'}；请在任务记录中处理后重新验证`);
          if (projection.values.todos?.some((row: any) => row.status !== 'completed')) throw new Error('Agent 计划仍有未完成步骤，请继续任务后再验证');
          return;
        }
      }
      await delay(2000, undefined, { signal });
    }
  }
  async retry() {
    await this.load();
    if (this.active || this.claiming || this.isRestarting) throw new Error('已有迭代正在进行');
    if (!this.record || !['failed', 'cancelled', 'rolled-back'].includes(this.record.state.phase)) throw new Error('仅在迭代停止、需要处理或回退后重试；已更新版本请开始新一轮');
    if (!this.record?.snapshot || !this.record.state.sessionId) throw new Error('本轮尚未建立完整源码与任务，请重新开始');
    this.launch(async signal => { await this.set('coding', '等待当前迭代任务结束，再重新执行独立验证'); await this.waitForTask(signal); await this.verifyAndRestart(signal); });
    return this.record.state;
  }
  async cancel() {
    if (this.isRestarting) throw new Error('版本切换已开始，请等待启动或回退结果');
    this.abort?.abort();
    const sessionId = this.record?.state.sessionId;
    if (sessionId && this.active) await this.options.call('session/cancel', { request: { sessionId } }).catch(() => {});
    await this.active;
    return this.record?.state ?? null;
  }
  private async verifyAndRestart(signal: AbortSignal) {
    // Build CLIs use the installed Node toolchain, as npm does. Electron's argv
    // semantics differ even in RUN_AS_NODE mode and confuse tools such as yargs.
    const artifact = await verifyCandidate(this.record!.snapshot!, { node: 'node', nativeResources: this.options.nativeResources, evidence: this.record!.state.evidence, signal, onStep: (phase, message) => this.set(phase, message) });
    await this.set('waiting-idle', '验证通过，等待其他任务结束后自动更新并重启');
    while ((await this.options.call('session/list', { _request: {} })).items.some((row: any) => row.running)) await delay(2000, undefined, { signal });
    signal.throwIfAborted();
    const updateRoot = join(this.options.userData, 'updates', this.record!.state.id);
    const manifestPath = join(updateRoot, 'handoff.json');
    const manifest: HandoffManifest = {
      schema: 1, id: this.record!.state.id, token: randomUUID(), oldPid: process.pid, userData: this.options.userData, candidateSource: this.record!.snapshot!.candidate, timeoutMs: 150000,
      previous: { executable: this.options.executable, args: this.options.packaged ? [] : [this.options.appRoot], cwd: this.options.packaged ? dirname(this.options.executable) : this.options.appRoot, version: this.options.version, sha256: await executableHash(this.options.executable), ...(this.options.packaged ? { resourcesSha256: await resourcesHash(join(dirname(this.options.executable), 'resources')) } : {}) },
      candidate: { executable: artifact.executable, args: [], cwd: dirname(artifact.executable), version: artifact.version, sha256: artifact.sha256, resourcesSha256: artifact.resourcesSha256 },
    };
    await writeJson(manifestPath, manifest);
    await this.set('restarting', '正在自动切换版本；新版本启动失败会回退');
    const watchdog = spawn(this.options.executable, [this.options.watchdog, manifestPath], { cwd: dirname(this.options.executable), env: { ...buildEnvironment(process.env), ELECTRON_RUN_AS_NODE: '1' }, detached: true, windowsHide: true, stdio: 'ignore' });
    let error: Error | undefined; watchdog.once('error', value => { error = value; }); watchdog.unref();
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (error) throw error;
      if (watchdog.exitCode !== null) throw new Error('更新守护进程提前退出，原程序继续运行');
      try {
        const ready = JSON.parse(await readFile(join(updateRoot, 'watchdog-ready.json'), 'utf8'));
        if (ready.id === manifest.id && ready.pid === watchdog.pid) { this.options.quit(); return; }
      } catch (readError) { if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') throw readError; }
      await delay(100);
    }
    throw new Error('更新守护进程未就绪，原程序继续运行');
  }
}
