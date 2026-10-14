import { mkdir } from 'node:fs/promises';
import type { Workspace } from '../shared/contracts';

/** Files live in a product folder; identity and sessions remain owned by Harness. */
export class DefaultWorkspace {
  private pending?: Promise<{ workspace: Workspace }>;
  constructor(private directory: string, private call: (endpoint: string, args?: any) => Promise<any>) {}
  ensure(): Promise<{ workspace: Workspace }> {
    return this.pending ??= this.create().finally(() => { this.pending = undefined; });
  }
  private async create() {
    await mkdir(this.directory, { recursive: true });
    return this.call('workspace/create', { request: { path: this.directory } });
  }
}
