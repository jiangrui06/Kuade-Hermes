import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { handoffSchema, writeJson, type BootReceipt } from '../iteration/handoff';
import { isWithin } from '../iteration/source';

/** Readiness requires both the renderer's acknowledgement and a ready runtime. */
export async function bootHealth(userData: string, executable: string, version: string, argv: string[]) {
  const path = argv.find(arg => arg.startsWith('--kuade-handoff='))?.slice('--kuade-handoff='.length);
  if (!path) return { ready: async () => {} };
  if (!isWithin(join(userData, 'updates'), path)) throw new Error('更新回执路径超出本机更新目录');
  const manifest = handoffSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const role = argv.includes('--kuade-handoff-role=previous') ? 'previous' : 'candidate';
  if (resolve(manifest.userData) !== resolve(userData) || resolve(manifest[role].executable) !== resolve(executable) || manifest[role].version !== version) throw new Error('启动版本或用户目录与更新记录不符');
  const receipt: BootReceipt = { id: manifest.id, token: manifest.token, pid: process.pid, version, stage: 'starting', at: Date.now() };
  const target = join(dirname(path), role + '-health.json');
  await writeJson(target, receipt);
  return { ready: async () => { await writeJson(target, { ...receipt, stage: 'ready', at: Date.now() }); } };
}
