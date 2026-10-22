import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { GitChanges, GitPreview } from '../shared/git';
export type { GitChanges } from '../shared/git';
const exec = promisify(execFile);
export class GitService {
  constructor(private resolveSessionDirectory: (sessionId: string) => Promise<string>) {}
  private async git(cwd: string, args: string[]): Promise<string> {
    const result = await exec('git', ['--literal-pathspecs', '-c', 'core.quotepath=false', '-C', cwd, ...args], { windowsHide: true, timeout: 15000, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' });
    return result.stdout;
  }
  async changes(sessionId: string): Promise<GitChanges> {
    const cwd = await this.resolveSessionDirectory(sessionId);
    try { await this.git(cwd, ['rev-parse', '--is-inside-work-tree']); }
    catch (error) {
      if (/not a git repository/i.test(String((error as { stderr?: string }).stderr))) throw new Error('这个项目尚未启用 Git。可以让 Kuade 初始化 Git 后再查看修改；项目文件仍保存在原文件夹。');
      throw error;
    }
    const [diff, names, untracked, branch] = await Promise.all([
      this.git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--']),
      this.git(cwd, ['diff', '--name-only', '-z', '--']),
      this.git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
      this.git(cwd, ['branch', '--show-current']),
    ]);
    return { diff, files: names.split('\0').filter(Boolean), untracked: untracked.split('\0').filter(Boolean), branch: branch.trim() };
  }
  async preview(sessionId: string, file: string): Promise<GitPreview> {
    const cwd = await this.resolveSessionDirectory(sessionId);
    const changes = await this.changes(sessionId);
    if (changes.files.includes(file)) return { kind: 'diff', content: await this.git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--', file]) };
    if (!changes.untracked.includes(file)) throw new Error('文件已不在修改列表中，请刷新后重试');
    const root = await realpath(cwd), target = resolve(root, file);
    const inside = (path: string) => { const rel = relative(root, path); return rel !== '' && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel); };
    if (!inside(target) || !inside(await realpath(target))) throw new Error('仅支持预览当前项目内的文件');
    if ((await lstat(target)).isSymbolicLink()) return { kind: 'unavailable', content: '', message: '这是符号链接，请在项目文件夹中查看。' };
    const handle = await open(target, 'r');
    try {
      if (!(await handle.stat()).isFile()) return { kind: 'unavailable', content: '', message: '这个条目不是普通文件。' };
      const limit = 256 * 1024, buffer = Buffer.alloc(limit + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const data = buffer.subarray(0, Math.min(bytesRead, limit));
      if (data.includes(0)) return { kind: 'unavailable', content: '', message: '这是二进制文件，文本预览暂不支持。' };
      let content: string;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(data, { stream: bytesRead > limit }); }
      catch { return { kind: 'unavailable', content: '', message: '文件使用非 UTF-8 编码，请在编辑器中查看。' }; }
      return { kind: 'text', content, ...(bytesRead > limit ? { message: '文件较大，仅显示前 256 KB。' } : {}) };
    } finally { await handle.close(); }
  }
  async restore(sessionId: string, file: string, expectedDiff: string): Promise<void> {
    const cwd = await this.resolveSessionDirectory(sessionId);
    const current = await this.changes(sessionId);
    if (!current.files.includes(file)) throw new Error('所选文件已不在待检查的修改列表中');
    if (current.diff !== expectedDiff) throw new Error('文件已发生新的修改，请刷新并重新检查后再恢复');
    await this.git(cwd, ['restore', '--worktree', '--', file]);
  }
}
