import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-tools';
import type { CapabilityInventory, ToolReceipt } from '../shared/capabilities';

/** Read-only adapter to the actual upstream registry, never a second MCP client. */
export default class Capabilities extends TypertRemoteService {
  static inject = ['typert', 'tools'];
  private readonly calls = new Map<string, ToolReceipt>();
  constructor(ctx: Context) {
    super(ctx, 'kuadeCapabilities');
    ctx.on('tools/result', (execution, result) => {
      if (!execution.name.startsWith('mcp__')) return;
      this.calls.set(execution.name, { name: execution.name, at: Date.now(), outcome: result.isError ? 'failed' : 'succeeded' });
      if (this.calls.size > 1000) this.calls.delete(this.calls.keys().next().value!);
    });
  }
  @Remote
  inventory(): CapabilityInventory {
    return {
      tools: this.ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__')).map(tool => ({ name: tool.name, description: tool.description })),
      calls: [...this.calls.values()], observedAt: Date.now(),
    };
  }
}
