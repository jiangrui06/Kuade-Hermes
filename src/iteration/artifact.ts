import * as nodeFs from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
// Electron's patched fs treats .asar as a virtual directory. Hash actual bytes.
const fs: typeof nodeFs = process.versions.electron ? createRequire(import.meta.url)('original-fs') : nodeFs;

/** Electron's executable alone does not identify the bundled application code. */
export async function resourcesHash(root: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (path: string) => {
    const stat = await fs.promises.lstat(path);
    if (stat.isSymbolicLink()) throw new Error('构建产物含链接，请重新构建');
    if (stat.isDirectory()) { for (const entry of (await fs.promises.readdir(path)).sort()) await walk(join(path, entry)); }
    else if (stat.isFile()) {
      hash.update(relative(root, path).split(sep).join('/') + '\0' + stat.size + '\0');
      for await (const chunk of fs.createReadStream(path)) hash.update(chunk);
      hash.update('\0');
    }
  };
  await walk(root); return hash.digest('hex');
}
