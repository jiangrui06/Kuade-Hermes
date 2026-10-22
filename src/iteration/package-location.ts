import { access, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Node must not satisfy omitted package dependencies from a source ancestor. */
export async function assertIndependentPackageDirectory(path: string): Promise<void> {
  let directory = await realpath(path);
  for (;;) {
    try {
      await access(join(directory, 'node_modules'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(directory);
      if (parent === directory) return;
      directory = parent;
      continue;
    }
    throw new Error('候选发行目录的祖先含 node_modules，请将迭代构建目录移出源码树：' + directory);
  }
}
