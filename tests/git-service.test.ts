// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { GitService } from '../src/main/git-service';
const exec = promisify(execFile);
describe('真实 Git 修改检查', () => {
  it('中文路径的恢复只影响选中文件，拒绝过期 Diff', async () => {
    const root = resolve('.cache/git-tests'); await mkdir(root, { recursive: true });
    const cwd = await mkdtemp(join(root, '项目 '));
    const git = (...args: string[]) => exec('git', ['-C', cwd, ...args], { windowsHide: true });
    await git('init');
    await git('config', 'core.autocrlf', 'false');
    await writeFile(join(cwd, '中文 文件.txt'), 'before\n');
    await writeFile(join(cwd, 'keep.txt'), 'keep\n');
    await git('add', '--', '中文 文件.txt', 'keep.txt');
    // The index is the restore reference; no branch or commit is needed.
    await writeFile(join(cwd, '中文 文件.txt'), 'changed\n');
    const service = new GitService(async () => cwd);
    const initial = await service.changes('fixture');
    expect(initial.files).toContain('中文 文件.txt');
    await writeFile(join(cwd, 'keep.txt'), 'user-new-edit\n');
    await expect(service.restore('fixture', '中文 文件.txt', initial.diff)).rejects.toThrow('新的修改');
    const current = await service.changes('fixture');
    await service.restore('fixture', '中文 文件.txt', current.diff);
    expect(await readFile(join(cwd, '中文 文件.txt'), 'utf8')).toBe('before\n');
    expect(await readFile(join(cwd, 'keep.txt'), 'utf8')).toBe('user-new-edit\n');
  }, 30000);
});
