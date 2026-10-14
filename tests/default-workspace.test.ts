import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { DefaultWorkspace } from '../src/main/default-workspace';

it('首次创建默认目录，并发初始化复用一次注册，后续启动保留用户文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-default-'));
  const directory = join(root, '默认工作区');
  const call = vi.fn(async () => ({ workspace: { workspaceId: 'stable-id', path: directory } }));
  const workspace = new DefaultWorkspace(directory, call);
  const [first, second] = await Promise.all([workspace.ensure(), workspace.ensure()]);
  expect(first).toEqual(second); expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith('workspace/create', { request: { path: directory } });
  await writeFile(join(directory, 'keep.txt'), '用户内容');
  await new DefaultWorkspace(directory, call).ensure();
  expect(await readFile(join(directory, 'keep.txt'), 'utf8')).toBe('用户内容');
});
