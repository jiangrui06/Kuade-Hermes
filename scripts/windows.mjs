// Keep small-file-heavy build dependencies on the local system drive.
// The workspace remains the source of truth; this directory contains generated copies only.
import { cp, mkdir, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)));
const action = process.argv[2] ?? 'dev';
if (!['install', 'dev', 'typecheck', 'test', 'build', 'build:computer', 'start', 'test:e2e', 'package:win'].includes(action)) throw new Error('Unknown development action');
if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('This helper is for Windows');
let target = join(process.env.LOCALAPPDATA, 'Kuade-development', basename(workspace));
if (resolve(target) === workspace) throw new Error('Run this helper from the source workspace');
await mkdir(target, { recursive: true });
target = realpathSync.native(target);
for (const name of ['src', 'assets', 'scripts', 'tests', 'docs', 'vendor', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'electron-builder.yml', 'README.md', 'THIRD_PARTY_NOTICES.md']) {
  await cp(join(workspace, name), join(target, name), { recursive: true, force: true });
}
console.log('Build directory:', target);
const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', action === 'install' ? 'npm ci --no-audit --no-fund' : `npm run ${action}`], { cwd: target, env: process.env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
