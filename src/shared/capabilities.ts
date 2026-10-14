export interface ToolObservation { name: string; description: string }
export interface ToolReceipt { name: string; at: number; outcome: 'succeeded' | 'failed' }
export interface CapabilityInventory { tools: ToolObservation[]; calls: ToolReceipt[]; observedAt: number }
export interface ServerCapability {
  name: string;
  state: 'disabled' | 'registered' | 'unavailable';
  tools: ToolObservation[];
  lastCall?: ToolReceipt;
}
export interface CapabilityReport { servers: ServerCapability[]; observedAt: number }
export interface ProjectSkill { name: string; description: string; path?: string; modelInvocable: boolean }
