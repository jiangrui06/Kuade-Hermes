import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
test('native observer rejects a recycled identity and captures a non-child exit code', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const evidence='D:/Kuade-acceptance/host-'+randomUUID(); await mkdir(evidence);
  const release=join(evidence,'release');
  const fixture=join(evidence,'fixture.mjs');
  await writeFile(fixture,"import{existsSync}from'node:fs';while(!existsSync(process.argv[2]))await new Promise(r=>setTimeout(r,50));process.exit(7);");
  const child=spawn(process.execPath,[fixture,release],{windowsHide:true,stdio:'ignore'});
  const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const observer=fileURLToPath(new URL('./windows-exit-observer.ps1',import.meta.url));
  try {
    const {stdout}=await exec(powershell,['-NoProfile','-Command',`(Get-Process -Id ${child.pid}).StartTime.ToUniversalTime().ToString('o')`],{windowsHide:true});
    const args=['-NoProfile','-File',observer,'-ProcessId',String(child.pid),'-ExpectedExecutable',process.execPath,'-Evidence',evidence];
    await assert.rejects(exec(powershell,[...args,'-ExpectedStartTime','2000-01-01T00:00:00Z'],{windowsHide:true}),error=>error.code===1);
    await assert.rejects(readFile(join(evidence,'exit-observation.json')),{code:'ENOENT'});
    const watching=exec(powershell,[...args,'-ExpectedStartTime',stdout.trim()],{windowsHide:true});
    const deadline=Date.now()+10000;let attached;
    while(Date.now()<deadline){attached=await readFile(join(evidence,'exit-observation.json'),'utf8').then(s=>JSON.parse(s.replace(/^\uFEFF/,''))).catch(()=>undefined);if(attached?.status==='running')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(attached?.status,'running');
    await writeFile(release,'release');await watching;
    const result=JSON.parse((await readFile(join(evidence,'exit-observation.json'),'utf8')).replace(/^\uFEFF/,''));
    assert.equal(result.processId,child.pid);assert.equal(result.status,'exited');assert.equal(result.exitCode,7);
    console.log('Native exit observer evidence: '+evidence);
  } finally {if(child.exitCode===null)child.kill();}
});
