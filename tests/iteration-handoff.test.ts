// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executableHash, processAlive, runHandoff, type HandoffManifest } from '../src/iteration/handoff';
async function stop(pid: number) {
  try { process.kill(pid); } catch {}
  await expect.poll(() => processAlive(pid), { timeout: 5000, interval: 50 }).toBe(false);
}

it('真实子进程：健康候选自动切换；错误回执和启动失败回退到旧版本', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-handoff-'));
  const owned: number[] = [];
  try {
    const fixture = join(root, 'fixture.cjs');
    await writeFile(fixture, `const fs=require('node:fs');const path=require('node:path');const manifest=process.argv.find(x=>x.startsWith('--kuade-handoff=')).slice('--kuade-handoff='.length);const data=JSON.parse(fs.readFileSync(manifest));const role=process.argv.includes('--kuade-handoff-role=previous')?'previous':'candidate';if(role==='candidate'&&process.argv.includes('crash'))process.exit(9);const token=role==='candidate'&&process.argv.includes('wrong-token')?'stale':data.token;fs.writeFileSync(path.join(path.dirname(manifest),role+'-health.json'),JSON.stringify({id:data.id,token,pid:process.pid,version:data[role].version,stage:'ready',at:Date.now()}));setInterval(()=>{},1000);`);
    const sha256 = await executableHash(process.execPath);
    let activeId: string | undefined;
    for (const behavior of ['healthy', 'crash', 'wrong-token']) {
      const id = randomUUID(); const manifestPath = join(root, id + '.json');
      const spec = { executable: process.execPath, args: [fixture, behavior], cwd: root, version: '0.1.6', sha256 };
      const manifest: HandoffManifest = { schema: 1, id, token: randomUUID(), oldPid: process.pid, userData: root, candidateSource: root, previous: { ...spec, version: '0.1.5' }, candidate: spec, timeoutMs: 1000 };
      await writeFile(manifestPath, JSON.stringify(manifest));
      const result = await runHandoff(manifestPath, { waitForOld: async () => {}, pollMs: 20, settleMs: 30 });
      if (result.pid) owned.push(result.pid);
      expect(result.status).toBe(behavior === 'healthy' ? 'completed' : 'rolled-back');
      expect(result.version).toBe(behavior === 'healthy' ? '0.1.6' : '0.1.5');
      if (behavior === 'healthy') activeId = id;
      expect(JSON.parse(await readFile(join(root, 'active-version.json'), 'utf8')).id).toBe(activeId);
      if (result.pid) { await stop(result.pid); owned.splice(owned.indexOf(result.pid), 1); }
    }
  } finally {
    for (const pid of owned) await stop(pid);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 15000);
