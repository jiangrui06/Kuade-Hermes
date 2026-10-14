import { randomUUID } from 'node:crypto';

/** The pinned upstream wire protocol is contained here, outside product UI. */
export class HarnessRpc {
  constructor(private readonly origin: string, private readonly cookie: string) {}
  async call(endpoint: string, args: Record<string, unknown> = {}): Promise<any> {
    const rpcId = randomUUID();
    const response = await fetch(`${this.origin}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Harness ${endpoint}: HTTP ${response.status}`);
    const envelope = await response.json() as any;
    if (envelope.rpcId !== rpcId || envelope.type !== 'server-response') throw new Error('Harness 返回了不匹配的响应');
    if (!envelope.result?.ok) throw new Error(envelope.result?.error?.message ?? 'Harness 请求失败');
    return envelope.result.value;
  }
}
