import { runHandoff } from './handoff';
const manifest = process.argv[2];
if (!manifest) throw new Error('Expected one handoff manifest path');
await runHandoff(manifest);
