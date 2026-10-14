/** Product state is advanced by the host, never by assistant completion prose. */
export type IterationPhase = 'preparing' | 'coding' | 'testing' | 'building' | 'waiting-idle' | 'restarting' | 'completed' | 'rolled-back' | 'failed' | 'cancelled';
export interface IterationState {
  id: string;
  phase: IterationPhase;
  source: string;
  candidate: string;
  requirement: string;
  startedAt: number;
  updatedAt: number;
  baseVersion: string;
  targetVersion: string;
  sessionId?: string;
  workspaceId?: string;
  message: string;
  evidence: string;
}
export interface VerificationStep {
  name: string;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  log: string;
}
export interface SourceEntry { path: string; sha256: string }
export interface SourceSnapshot {
  source: string;
  candidate: string;
  baseline: string;
  baseVersion: string;
  targetVersion: string;
  files: SourceEntry[];
}
