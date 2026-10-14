import { z } from 'zod';
import type { CapabilityReport, ProjectSkill } from '../shared/capabilities';
import type { ExtensionsConfig } from './extensions';

const inventorySchema = z.object({
  observedAt: z.number(),
  tools: z.array(z.object({ name: z.string(), description: z.string() })),
  calls: z.array(z.object({ name: z.string(), at: z.number(), outcome: z.enum(['succeeded', 'failed']) })),
});
export function capabilityReport(config: ExtensionsConfig, input: unknown): CapabilityReport {
  const inventory = inventorySchema.parse(input);
  return { observedAt: inventory.observedAt, servers: Object.entries(config.mcpServers).map(([name, options]) => {
    const prefix = `mcp__${name}__`;
    const tools = inventory.tools.filter(tool => tool.name.startsWith(prefix));
    const lastCall = inventory.calls.filter(call => call.name.startsWith(prefix)).sort((a, b) => b.at - a.at)[0];
    return { name, state: options.disabled ? 'disabled' : tools.length ? 'registered' : 'unavailable', tools, ...(lastCall ? { lastCall } : {}) };
  }) };
}
const skillsSchema = z.object({ skills: z.array(z.object({ name: z.string(), description: z.string(), path: z.string().optional(), modelInvocable: z.boolean() })) });
type Call = (endpoint: string, args?: Record<string, unknown>) => Promise<any>;
export class CapabilitiesService {
  private probes = new Map<string, Promise<string>>();
  constructor(private call: Call, private readConfig: () => Promise<ExtensionsConfig>) {}
  async status(): Promise<CapabilityReport> {
    const [config, inventory] = await Promise.all([this.readConfig(), this.call('kuadeCapabilities/inventory')]);
    return capabilityReport(config, inventory);
  }
  async skills(workspaceId: string, sessionId?: string): Promise<ProjectSkill[]> {
    // Official skills/list resolves the preset and project roots, including cold sessions.
    // A hidden blank session supplies that context before the user has started a task.
    if (!sessionId) {
      let probe = this.probes.get(workspaceId);
      if (!probe) {
        probe = this.call('session/create', { request: { workspaceId, agentPreset: 'standard' } }).then(result => result.sessionId);
        this.probes.set(workspaceId, probe);
      }
      try { sessionId = await probe; } catch (error) { this.probes.delete(workspaceId); throw error; }
    }
    return skillsSchema.parse(await this.call('skills/list', { request: { sessionId } })).skills;
  }
}
