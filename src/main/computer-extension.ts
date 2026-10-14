import { access } from 'node:fs/promises';
import { join } from 'node:path';

/** Product wiring only; desktop observation and input remain owned by the MCP. */
export async function computerExtension(root: string, platform: string, arch: string) {
  if (platform !== 'win32' || arch !== 'x64') throw new Error('当前发行版提供 Windows x64 电脑控制；macOS 版本仍待构建与实机验收。');
  const command = join(root, 'computer', 'qwen-computer-use.exe');
  try { await access(command); } catch { throw new Error('电脑控制组件缺失。开发环境请运行 build:computer，发行版请检查安装文件。'); }
  return { command, args: ['--foreground-input', 'mcp'], toolCallTimeoutMs: 120000 };
}
