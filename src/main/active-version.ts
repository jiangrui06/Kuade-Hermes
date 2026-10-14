import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { executableHash, handoffSchema } from '../iteration/handoff';
import { resourcesHash } from '../iteration/artifact';

/** Existing shortcuts can continue to point to an earlier portable version. */
export async function activeVersion(userData: string, executable: string, argv: string[]) {
  if (argv.some(arg => arg.startsWith('--kuade-handoff='))) return;
  try {
    const entry = JSON.parse(await readFile(join(userData, 'active-version.json'), 'utf8'));
    if (entry.status !== 'completed') return;
    const launch = handoffSchema.shape.candidate.parse(entry.launch);
    if (relative(executable, launch.executable) === '') return;
    if (await executableHash(launch.executable) !== launch.sha256) return;
    if (launch.resourcesSha256 && await resourcesHash(join(dirname(launch.executable), 'resources')) !== launch.resourcesSha256) return;
    return launch;
  } catch { /* Missing/invalid candidate falls back to this intact version. */ }
}
