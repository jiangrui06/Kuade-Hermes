// Rebuild the pinned, independent MCP. No global PATH or machine registration changes.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This release gate targets Windows x64; macOS native acceptance remains separate.');
const source = resolve('vendor/qwen-computer-use');
const output = resolve('resources/computer');
await mkdir(output, { recursive: true });
const go = process.env.KUADE_GO_EXECUTABLE || 'go';
function run(args) {
  const result = spawnSync(go, args, { cwd: source, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Computer MCP gate ${args[0]} exited ${result.status}`);
}
run(['test', './...']);
run(['vet', './...']);
const binary = resolve(output, 'qwen-computer-use.exe');
run(['build', '-trimpath', '-o', binary, '.']);
await writeFile(resolve(output, 'LICENSE'), await readFile(resolve(source, 'LICENSE')));
const sources = [];
async function fingerprint(path = '') {
  for (const entry of (await readdir(resolve(source, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path ? path + '/' + entry.name : entry.name;
    if (entry.isDirectory()) await fingerprint(child);
    else if (entry.isFile()) sources.push({ path: 'vendor/qwen-computer-use/' + child, sha256: createHash('sha256').update(await readFile(resolve(source, child))).digest('hex') });
    else throw new Error('Native source contains a non-regular file: ' + child);
  }
}
await fingerprint();
await writeFile(resolve(output, 'provenance.json'), JSON.stringify({
  component: 'qwen_computer', version: '0.2.3-local.15', source: 'vendor/qwen-computer-use',
  upstream: 'https://github.com/iFurySt/open-codex-computer-use',
  upstreamCommit: '24b7cae4d449a5a8ea58c583e5151096b26de03c',
  sha256: createHash('sha256').update(await readFile(binary)).digest('hex'),
  sources,
  gates: ['go test ./...', 'go vet ./...', 'go build'], builtAt: new Date().toISOString(),
}, null, 2));
console.log('Built and checked:', binary);
