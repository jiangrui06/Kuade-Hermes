/** Product-owned contracts. No Electron or Harness imports across this boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RuntimeState = { phase: 'starting' | 'ready' | 'error' | 'stopped'; message: string; version: string };
export type Workspace = { workspaceId: string; path: string; title: string; sessionIds: string[] };
export type Task = { sessionId: string; updatedAt: number; running: boolean; blank: boolean; cwd?: string; projections?: { kind?: 'cached' | 'sequenced'; asOfSeq?: number; values: Record<string, any> } };
export type Approval = { eventId: string; event: string; agentId: string; request: Record<string, any> };
export type RuntimeEvent = { kind: 'state'; state: RuntimeState } | { kind: 'stream'; id: string; value: any } | { kind: 'stream-error'; id: string; message: string };
export interface DesktopBridge {
  status(): Promise<RuntimeState>;
  restart(): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  call(endpoint: string, args?: Record<string, unknown>): Promise<any>;
  subscribe(id: string, endpoint: string, args?: Record<string, unknown>): Promise<void>;
  unsubscribe(id: string): Promise<void>;
  onEvent(listener: (event: RuntimeEvent) => void): () => void;
  window(action: 'minimize' | 'maximize' | 'close'): void;
}
declare global { interface Window { kuade: DesktopBridge } }
