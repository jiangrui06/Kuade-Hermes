import { app, BrowserWindow, dialog, ipcMain, Menu, powerSaveBlocker, protocol, net, clipboard, shell } from 'electron';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { RuntimeSupervisor } from '../runtime/supervisor';
import { ExtensionsStore } from '../runtime/extensions';
import { GitService } from './git-service';
import { buildEditMenuTemplate } from './edit-menu';
import { DefaultWorkspace } from './default-workspace';
import { ModelCatalogService } from '../runtime/model-catalog';
import { CapabilitiesService } from '../runtime/capabilities-service';
import { computerExtension } from './computer-extension';
import { GitHubExtension, githubInstaller } from './github-extension';
import { IterationService } from '../iteration/service';
import { bootHealth } from './boot-health';
import { activeVersion } from './active-version';
import { PRODUCT_NAME, LEGACY_DATA_DIRECTORY } from '../shared/branding';
import { messageWebUrl } from '../shared/message-url';

protocol.registerSchemesAsPrivileged([{ scheme: 'kuade', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setPath('userData', process.env.KUADE_USER_DATA ? resolve(process.env.KUADE_USER_DATA) : join(app.getPath('appData'), LEGACY_DATA_DIRECTORY));
app.setName(PRODUCT_NAME);
const redirect = await activeVersion(app.getPath('userData'), process.execPath, process.argv, app.getVersion());
if (redirect) { app.relaunch({ execPath: redirect.executable, args: redirect.args }); app.exit(0); }
let window: BrowserWindow | undefined;
let runtime: RuntimeSupervisor;
let iterations: IterationService | undefined;
let quitting = false;
let blocker: number | undefined;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.whenReady().then(async () => {
  const health = await bootHealth(app.getPath('userData'), process.execPath, app.getVersion(), process.argv);
  Menu.setApplicationMenu(null);
  const rendererRoot = join(app.getAppPath(), 'dist/renderer');
  protocol.handle('kuade', request => {
    const url = new URL(request.url);
    const target = resolve(rendererRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.host !== 'app' || !target.startsWith(rendererRoot + sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(target).href);
  });
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1000, minHeight: 720, show: false,
    title: PRODUCT_NAME, backgroundColor: '#f6f4ef', frame: false,
    icon: join(app.getAppPath(), 'assets/icon.png'),
    webPreferences: { preload: join(app.getAppPath(), 'dist/preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const devUrl = !app.isPackaged ? process.env.KUADE_DEV_URL : undefined;
  const allowedOrigin = devUrl ? new URL(devUrl).origin : 'kuade://app';
  const assertSender = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => {
    const frame = event.senderFrame;
    if (!frame || frame !== window?.webContents.mainFrame || !(frame.url === allowedOrigin || frame.url.startsWith(allowedOrigin + '/'))) throw new Error('消息来源不受信任');
  };
  runtime = new RuntimeSupervisor(join(app.getPath('userData'), 'harness'), event => {
    if (window && !window.isDestroyed()) window.webContents.send('kuade:event', event);
  });
  const handle = (name: string, fn: (...args: any[]) => unknown) => ipcMain.handle(name, (event, ...args) => { assertSender(event); return fn(...args); });
  handle('kuade:status', () => runtime.state);
  handle('kuade:restart', async () => {
    if (runtime.state.phase === 'ready' && (await getTasks()).some(row => row.running)) throw new Error('请先停止正在执行的任务，再重新启动引擎');
    await runtime.stop(); await runtime.start();
  });
  handle('kuade:directory', async () => {
    const selection = await dialog.showOpenDialog(window!, { title: '选择项目文件夹', properties: ['openDirectory'] });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  });
  const argsSchema = z.record(z.string(), z.unknown());
  const isolatedProfile = resolve(app.getPath('userData')).toLowerCase() !== resolve(join(app.getPath('appData'), LEGACY_DATA_DIRECTORY)).toLowerCase();
  const defaultWorkspace = new DefaultWorkspace(join(isolatedProfile ? app.getPath('userData') : join(app.getPath('documents'), 'Kuade'), '默认工作区'), (endpoint, args) => runtime.call(endpoint, args));
  const models = new ModelCatalogService((endpoint, args) => runtime.call(endpoint, args));
  const extensions = new ExtensionsStore(join(app.getPath('userData'), 'harness'));
  const github = new GitHubExtension(join(app.getPath('userData'), 'tools'), process.platform, process.arch, githubInstaller((url, init) => net.fetch(url, init)));
  const capabilities = new CapabilitiesService((endpoint, args) => runtime.call(endpoint, args), () => extensions.read());
  iterations = new IterationService({
    userData: app.getPath('userData'), buildRoot: process.env.KUADE_BUILD_ROOT ? resolve(process.env.KUADE_BUILD_ROOT) : join(process.env.LOCALAPPDATA ?? app.getPath('temp'), 'Kuade-iterations'),
    executable: process.execPath, appRoot: app.getAppPath(), version: app.getVersion(), packaged: app.isPackaged,
    nativeResources: join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), 'computer'),
    watchdog: join(app.getAppPath(), 'dist/runtime/update-watchdog.mjs').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
    call: (endpoint, args) => runtime.call(endpoint, args), prepareModel: (provider, model) => models.prepare(provider, model), quit: () => app.quit(),
  });
  const getTasks = async () => (await runtime.call('session/list', { _request: {} })).items as Array<{ sessionId: string; cwd?: string; running: boolean }>;
  const git = new GitService(async id => {
    const task = (await getTasks()).find(row => row.sessionId === id);
    if (!task?.cwd) throw new Error('未找到此任务的本地项目目录');
    return task.cwd;
  });
  handle('kuade:call', async (endpoint, input = {}) => {
    z.string().max(120).parse(endpoint);
    const args = argsSchema.parse(input);
    if (endpoint === 'app/info') return { version: app.getVersion(), packaged: app.isPackaged };
    if (endpoint === 'app/copy-text') return clipboard.writeText(z.string().max(5 * 1024 * 1024).parse(args.text));
    if (endpoint === 'app/open-web-link') {
      const url = messageWebUrl(z.string().max(8192).parse(args.url));
      if (!url) throw new Error('仅支持有效的 HTTP 或 HTTPS 网页链接');
      return shell.openExternal(url);
    }
    if (endpoint === 'app/ready') { if (runtime.state.phase === 'ready') await health.ready(); return; }
    if (endpoint === 'iteration/status') return iterations!.status();
    if (endpoint === 'iteration/start') return iterations!.start(args);
    if (endpoint === 'iteration/cancel') return iterations!.cancel();
    if (endpoint === 'iteration/retry') return iterations!.retry();
    if (iterations!.isRestarting && ['session/prompt', 'session/create', 'commands/execute', 'extensions/save', 'goals/create', 'goals/resume'].includes(endpoint)) throw new Error('正在切换新版本，请稍候再开始任务');
    if (endpoint === 'workspace/default') return defaultWorkspace.ensure();
    if (endpoint === 'models/catalog') return models.catalog(args.refresh === true);
    if (endpoint === 'models/prepare') return models.prepare(z.string().min(1).parse(args.provider), z.string().min(1).parse(args.model));
    if (endpoint === 'extensions/read') return extensions.read();
    if (endpoint === 'extensions/computer') return computerExtension(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), process.platform, process.arch);
    if (endpoint === 'extensions/github') return github.configure();
    if (endpoint === 'extensions/status') return capabilities.status();
    if (endpoint === 'extensions/skills') return capabilities.skills(z.string().min(1).parse(args.workspaceId), z.string().min(1).optional().parse(args.sessionId));
    if (endpoint === 'extensions/save') {
      if ((await getTasks()).some(row => row.running)) throw new Error('请先停止正在执行的任务，再重新加载工具');
      await extensions.save(args.config); await runtime.stop(); await runtime.start(); return;
    }
    if (endpoint === 'git/changes') return git.changes(z.string().min(1).parse(args.sessionId));
    if (endpoint === 'git/preview') return git.preview(z.string().min(1).parse(args.sessionId), z.string().min(1).max(8192).parse(args.file));
    if (endpoint === 'git/restore') {
      const id = z.string().min(1).parse(args.sessionId);
      if ((await getTasks()).some(row => row.running)) throw new Error('请先停止任务，再恢复文件');
      return git.restore(id, z.string().min(1).parse(args.file), z.string().max(5 * 1024 * 1024).parse(args.expectedDiff));
    }
    const result = await runtime.call(endpoint, args);
    if (endpoint === 'settings/update' || endpoint === 'credentials/set') models.invalidate();
    return result;
  });
  handle('kuade:subscribe', (id, endpoint, args = {}) => runtime.subscribe(z.string().min(1).max(120).parse(id), z.string().parse(endpoint), argsSchema.parse(args)));
  handle('kuade:unsubscribe', id => runtime.unsubscribe(z.string().parse(id)));
  ipcMain.on('kuade:window', (event, action) => {
    assertSender(event);
    if (action === 'minimize') window?.minimize();
    if (action === 'maximize') window?.isMaximized() ? window.unmaximize() : window?.maximize();
    if (action === 'close') window?.close();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('context-menu', (_event, params) => {
    const template = buildEditMenuTemplate(params);
    if (template.length) Menu.buildFromTemplate(template).popup({ window: window!, frame: params.frame ?? undefined });
  });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(allowedOrigin + '/')) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window?.show());
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    void dialog.showMessageBox(window!, {
      type: 'question', title: `关闭 ${PRODUCT_NAME}`, message: '保持任务在后台运行？',
      detail: '后台运行会保留本地引擎。退出会停止正在执行的任务，已保存的记录仍然保留。',
      buttons: ['最小化，继续运行', `退出 ${PRODUCT_NAME}`, '取消'], defaultId: 0, cancelId: 2,
    }).then(({ response }) => { if (response === 0) window?.minimize(); if (response === 1) app.quit(); });
  });
  await window.loadURL(devUrl ?? 'kuade://app/index.html');
  // Protect long tasks from automatic idle sleep; explicit user sleep remains effective.
  blocker = powerSaveBlocker.start('prevent-app-suspension');
  void runtime.start().catch(() => {});
});
app.on('second-instance', () => { window?.restore(); window?.focus(); });
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  if (blocker !== undefined) powerSaveBlocker.stop(blocker);
  void (async () => { if (!iterations?.isRestarting) await iterations?.cancel(); await runtime?.stop(); })().finally(() => app.quit());
});
