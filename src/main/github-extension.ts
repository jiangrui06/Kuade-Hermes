import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Official v2.0.2 release, MIT. Archive hash matches the published checksums;
// executable hash was derived from that verified archive.
export const GITHUB_RELEASE = {
  version: '2.0.2',
  url: 'https://github.com/github/github-mcp-server/releases/download/v2.0.2/github-mcp-server_Windows_x86_64.zip',
  archiveHash: '4ae64087501650752f21c9d5af5378107a5116d94ee1cf37786b22b8c4bd99df',
  executableHash: '1bbf1cd5be216d5c622ccb0da4529d747c983fcf6bbf76f9c3e6c3b32877c1df',
};
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const exec = promisify(execFile);
interface Installer {
  release: typeof GITHUB_RELEASE;
  download(url: string): Promise<Uint8Array>;
  unpack(archive: string, destination: string): Promise<void>;
}
export const githubInstaller = (fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch): Installer => ({
  release: GITHUB_RELEASE,
  async download(url) {
    let response: Response;
    try { response = await fetcher(url, { signal: AbortSignal.timeout(180000) }); }
    catch { throw new Error('GitHub 组件下载未完成，请检查网络或系统代理后重试。'); }
    if (!response.ok) throw new Error(`GitHub 组件下载失败（HTTP ${response.status}），请稍后重试。`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > 30 * 1024 * 1024) throw new Error('GitHub 组件下载大小异常');
    return data;
  },
  async unpack(archive, destination) {
    // Paths are arguments in a private process environment, never shell text.
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:KUADE_TOOL_ARCHIVE -DestinationPath $env:KUADE_TOOL_DESTINATION -ErrorAction Stop'], {
      windowsHide: true, timeout: 60000,
      env: { ...process.env, KUADE_TOOL_ARCHIVE: archive, KUADE_TOOL_DESTINATION: destination },
    });
  },
});

/** Download wiring only. Authentication, GitHub APIs and MCP belong to GitHub. */
export class GitHubExtension {
  private pending?: Promise<{ command: string; args: string[]; toolCallTimeoutMs: number }>;
  constructor(private root: string, private platform = process.platform, private arch = process.arch, private install: Installer = githubInstaller()) {}
  configure() {
    return this.pending ??= this.prepare().finally(() => { this.pending = undefined; });
  }
  private async prepare() {
    if (this.platform !== 'win32' || this.arch !== 'x64') throw new Error('当前 GitHub 组件支持 Windows x64。');
    const release = this.install.release;
    const directory = join(this.root, 'github-mcp-' + release.version);
    const command = join(directory, 'github-mcp-server.exe');
    let cached: Buffer | undefined;
    try { cached = await readFile(command); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (cached && hash(cached) !== release.executableHash) throw new Error('GitHub 组件校验失败，请移走该版本的组件目录后重新添加。');
    if (!cached) {
      await mkdir(this.root, { recursive: true });
      const data = await this.install.download(release.url);
      if (hash(data) !== release.archiveHash) throw new Error('GitHub 下载文件校验失败，本次未启用组件。');
      const staging = await mkdtemp(join(this.root, 'github-download-'));
      const archive = join(staging, 'release.zip'); const unpacked = join(staging, 'unpacked');
      await writeFile(archive, data);
      await this.install.unpack(archive, unpacked);
      if (hash(await readFile(join(unpacked, 'github-mcp-server.exe'))) !== release.executableHash) throw new Error('GitHub 解压文件校验失败，本次未启用组件。');
      await rename(unpacked, directory);
    }
    return { command, args: ['stdio', '--toolsets', 'context,repos,issues,pull_requests,users,git', '--oauth-scopes', 'repo,read:org'], toolCallTimeoutMs: 180000 };
  }
}
