// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerExtension } from '../src/main/computer-extension';

it('电脑控制使用当前发行资源，缺少组件或未验收平台给出明确原因', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-computer-'));
  try {
    await expect(computerExtension(root, 'win32', 'x64')).rejects.toThrow('组件缺失');
    await expect(computerExtension(root, 'darwin', 'arm64')).rejects.toThrow('macOS');
    await mkdir(join(root, 'computer'));
    await writeFile(join(root, 'computer/qwen-computer-use.exe'), 'fixture-not-executable');
    await expect(computerExtension(root, 'win32', 'x64')).resolves.toMatchObject({ command: join(root, 'computer/qwen-computer-use.exe'), args: ['--foreground-input', 'mcp'] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
