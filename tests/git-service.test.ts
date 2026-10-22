// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { GitService } from '../src/main/git-service';
const exec = promisify(execFile);
describe('真实 Git 修改检查', () => {
  it('新文件预览处理中文、空文件、二进制、大小限制、路径越界与忽略文件', async () => {
    const root = resolve('.cache/git-tests'); await mkdir(root, { recursive: true });
    const cwd = await mkdtemp(join(root, '预览 '));
    const git = (...args: string[]) => exec('git', ['-C', cwd, ...args], { windowsHide: true });
    await git('init'); await git('config', 'core.autocrlf', 'false');
    await writeFile(join(cwd, '旧文件.txt'), 'before\n'); await git('add', '.');
    await writeFile(join(cwd, '旧文件.txt'), 'after\n');
    await writeFile(join(cwd, '新文件.md'), '# 中文说明\n');
    await writeFile(join(cwd, 'empty.txt'), '');
    await writeFile(join(cwd, 'binary.bin'), Buffer.from([0, 1, 2]));
    await writeFile(join(cwd, 'legacy.txt'), Buffer.from([255, 254, 233]));
    await writeFile(join(cwd, 'large.txt'), 'x'.repeat(300 * 1024));
    await writeFile(join(cwd, '.gitignore'), 'secret.txt\n'); await writeFile(join(cwd, 'secret.txt'), 'hidden');
    const service = new GitService(async () => cwd);
    expect(await service.preview('task', '新文件.md')).toEqual({ kind: 'text', content: '# 中文说明\n' });
    expect((await service.preview('task', '旧文件.txt')).content).toContain('+after');
    expect((await service.preview('task', 'empty.txt')).content).toBe('');
    expect((await service.preview('task', 'binary.bin')).kind).toBe('unavailable');
    expect((await service.preview('task', 'legacy.txt')).kind).toBe('unavailable');
    const large = await service.preview('task', 'large.txt'); expect(large.content.length).toBe(256 * 1024); expect(large.message).toContain('256 KB');
    for (const file of ['../outside.txt', 'secret.txt', '.git/config', resolve(cwd, '新文件.md')]) await expect(service.preview('task', file)).rejects.toThrow('修改列表');
    const outside = await mkdtemp(join(root, 'outside ')); await writeFile(join(outside, 'outside.txt'), 'private');
    await symlink(outside, join(cwd, 'linked'), 'junction');
    await expect(service.preview('task', 'linked/outside.txt')).rejects.toThrow('项目内');
  }, 30000);

  it('普通文件夹给出可操作的 Git 提示', async () => {
    const root = resolve('.cache/git-tests'); await mkdir(root, { recursive: true });
    const cwd = await mkdtemp(join(root, 'plain '));
    await expect(new GitService(async () => cwd).changes('task')).rejects.toThrow('尚未启用 Git');
  });
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
