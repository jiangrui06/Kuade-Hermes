import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startProjectServer } from './project-manager-verify.mjs';

async function fixture(source, run) {
  const directory = await mkdtemp(join(tmpdir(), 'kuade-project-verifier-'));
  const script = join(directory, 'server.mjs'), log = join(directory, 'server.log');
  try { await writeFile(script, source); await run(directory, log); }
  finally { await rm(script, { force: true }); await rm(log, { force: true }); await rmdir(directory); }
}
test('server harness waits for an actual dynamic port and stops only its child', async () => {
  await fixture(`import {createServer} from 'node:http';const server=createServer((q,r)=>r.end(process.env.DATA_FILE));server.listen(Number(process.env.PORT),'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));`, async (directory, log) => {
    const server = await startProjectServer(directory, 'unique-database-path', log);
    assert.equal(await (await fetch(server.url)).text(), 'unique-database-path');
    await server.stop(); assert.throws(() => process.kill(server.pid, 0));
    assert.match(await readFile(log, 'utf8'), /"port":\d+/);
  });
});
test('server startup failures are retained rather than reported ready', async () => {
  await fixture(`console.log('{"port":0}');console.error('fixture startup failure');process.exit(7);`, async (directory, log) => {
    await assert.rejects(startProjectServer(directory, 'unused', log), /exited before ready: 7/);
    assert.match(await readFile(log, 'utf8'), /fixture startup failure/);
  });
});
