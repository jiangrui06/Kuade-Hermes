import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,access } from 'node:fs/promises';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
const read=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
test('console-free observer validates identity and captures non-child exit codes 0, 7 and 259', {skip:process.platform!=='win32',timeout:60000},async()=>{
 const {stdout}=await exec('python',['-c',"import pathlib,sys;print(pathlib.Path(sys.executable).resolve().with_name('pythonw.exe'))"],{windowsHide:true});
 const pythonw=stdout.trim();await access(pythonw);
 const script=fileURLToPath(new URL('./windows-exit-observer.py',import.meta.url));
 const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const evidence=[];
 for(const code of [0,7,259]){
  const root='D:/Kuade-acceptance/host-'+randomUUID();await mkdir(root);evidence.push(root);
  const release=join(root,'release');const fixture=join(root,'fixture.mjs');
  await writeFile(fixture,`import{existsSync}from'node:fs';while(!existsSync(process.argv[2]))await new Promise(r=>setTimeout(r,50));process.exit(${code});`);
  const child=spawn(process.execPath,[fixture,release],{windowsHide:true,stdio:'ignore'});
  try{
   const {stdout:birth}=await exec(powershell,['-NoProfile','-Command',`(Get-Process -Id ${child.pid}).StartTime.ToUniversalTime().ToString('o')`],{windowsHide:true});
   const args=[script,'--pid',String(child.pid),'--executable',process.execPath,'--evidence',root];
   const wrong=spawn(pythonw,[...args,'--started','2000-01-01T00:00:00Z'],{windowsHide:true,stdio:'ignore'});
   assert.equal(await new Promise((done,reject)=>{wrong.once('exit',done);wrong.once('error',reject);}),1);
   assert.equal((await read(join(root,'exit-observation-gui.json'))).status,'not-passed');
   const watcher=spawn(pythonw,[...args,'--started',birth.trim()],{windowsHide:true,stdio:'ignore'});
   const closed=new Promise((done,reject)=>{watcher.once('exit',done);watcher.once('error',reject);});
   let state;const deadline=Date.now()+10000;
   while(Date.now()<deadline){state=await read(join(root,'exit-observation-gui.json')).catch(()=>undefined);if(state?.status==='running')break;await new Promise(r=>setTimeout(r,50));}
   assert.equal(state?.status,'running');assert.equal(state.consoleWindow,false);
   await writeFile(release,'release');assert.equal(await closed,0);
   const result=await read(join(root,'exit-observation-gui.json'));
   assert.equal(result.status,'exited');assert.equal(result.exitCode,code);assert.equal(result.processId,child.pid);
  }finally{if(child.exitCode===null)child.kill();}
 }
 console.log('GUI observer evidence: '+JSON.stringify(evidence));
});
