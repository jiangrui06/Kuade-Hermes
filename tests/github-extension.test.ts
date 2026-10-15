// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitHubExtension, GITHUB_RELEASE, githubInstaller } from '../src/main/github-extension';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kuade-github-')); roots.push(root);
  const download = vi.fn(async () => Buffer.from('verified archive'));
  const unpack = vi.fn(async (_archive: string, destination: string) => {
    await mkdir(destination); await writeFile(join(destination, 'github-mcp-server.exe'), 'verified binary');
  });
  const release = { ...GITHUB_RELEASE, archiveHash: hash('verified archive'), executableHash: hash('verified binary') };
  const service = new GitHubExtension(root, 'win32', 'x64', { release, download, unpack });
  return { root, service, download, unpack };
}
it('并发准备共用一次安装，校验缓存后复用，配置不携带凭据', async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([f.service.configure(), f.service.configure()]);
  expect(a).toEqual(b); expect(f.download).toHaveBeenCalledTimes(1);
  expect(a.command).toBe(join(f.root, 'github-mcp-2.0.2', 'github-mcp-server.exe'));
  expect(a.args).toContain('stdio'); expect(a).not.toHaveProperty('env');
  expect(await f.service.configure()).toEqual(a); expect(f.download).toHaveBeenCalledTimes(1);
  await writeFile(a.command, 'modified binary');
  await expect(f.service.configure()).rejects.toThrow('组件校验失败');
  expect(f.download).toHaveBeenCalledTimes(1);
});
it('下载校验失败不解压，错误后可重新准备', async () => {
  const f = await fixture(); f.download.mockResolvedValueOnce(Buffer.from('wrong download'));
  await expect(f.service.configure()).rejects.toThrow('下载文件校验失败');
  expect(f.unpack).not.toHaveBeenCalled();
  await expect(f.service.configure()).resolves.toHaveProperty('command');
});
it('解压得到不同可执行文件时不返回可运行配置', async () => {
  const f = await fixture(); f.unpack.mockImplementationOnce(async (_archive, destination) => {
    await mkdir(destination); await writeFile(join(destination, 'github-mcp-server.exe'), 'wrong binary');
  });
  await expect(f.service.configure()).rejects.toThrow('解压文件校验失败');
});
it('未支持的平台在下载前给出说明', async () => {
  const f = await fixture();
  await expect(new GitHubExtension(f.root, 'darwin', 'arm64').configure()).rejects.toThrow('Windows x64');
  expect(f.download).not.toHaveBeenCalled();
});
it('使用注入的桌面网络栈，HTTP 与连接错误不会进入解压阶段', async () => {
  const network = vi.fn(async () => new Response('unavailable', { status: 503 }));
  await expect(githubInstaller(network).download(GITHUB_RELEASE.url)).rejects.toThrow('HTTP 503');
  expect(network).toHaveBeenCalledWith(GITHUB_RELEASE.url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  network.mockRejectedValueOnce(new Error('transport details'));
  await expect(githubInstaller(network).download(GITHUB_RELEASE.url)).rejects.toThrow('检查网络或系统代理');
});
