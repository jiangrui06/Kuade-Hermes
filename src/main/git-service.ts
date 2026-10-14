import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export interface GitChanges { diff: string; files: string[]; untracked: string[]; branch: string }
export class GitService {
  constructor(private resolveSessionDirectory: (sessionId: string) => Promise<string>) {}
  private async git(cwd: string, args: string[]): Promise<string> {
    const result = await exec('git', ['--literal-pathspecs', '-c', 'core.quotepath=false', '-C', cwd, ...args], { windowsHide: true, timeout: 15000, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' });
    return result.stdout;
  }
  async changes(sessionId: string): Promise<GitChanges> {
    const cwd = await this.resolveSessionDirectory(sessionId);
    const [diff, names, untracked, branch] = await Promise.all([
      this.git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--']),
      this.git(cwd, ['diff', '--name-only', '-z', '--']),
      this.git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
      this.git(cwd, ['branch', '--show-current']),
    ]);
    return { diff, files: names.split('\0').filter(Boolean), untracked: untracked.split('\0').filter(Boolean), branch: branch.trim() };
  }
  async restore(sessionId: string, file: string, expectedDiff: string): Promise<void> {
    const cwd = await this.resolveSessionDirectory(sessionId);
    const current = await this.changes(sessionId);
    if (!current.files.includes(file)) throw new Error('所选文件已不在待检查的修改列表中');
    if (current.diff !== expectedDiff) throw new Error('文件已发生新的修改，请刷新并重新检查后再恢复');
    await this.git(cwd, ['restore', '--worktree', '--', file]);
  }
}
