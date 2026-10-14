import WebSocket from 'ws';
import type { RuntimeEvent } from '../shared/contracts';

/** One authenticated upstream connection; subscriptions survive transient socket loss. */
export class HarnessStreams {
  private socket?: WebSocket;
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;
  private subscriptions = new Map<string, { endpoint: string; args: Record<string, unknown> }>();
  constructor(private origin: string, private cookie: string, private emit: (event: RuntimeEvent) => void) {}
  connect(): void {
    if (this.closed) return;
    this.socket = new WebSocket(this.origin.replace('http:', 'ws:') + '/api/remote.mux', { headers: { Cookie: this.cookie } });
    this.socket.on('open', () => { for (const [id, spec] of this.subscriptions) this.open(id, spec); });
    this.socket.on('message', data => {
      try {
        const frame = JSON.parse(data.toString());
        if (!this.subscriptions.has(frame.streamId)) return;
        if (frame.type === 'item') this.emit({ kind: 'stream', id: frame.streamId, value: frame.value });
        else if (frame.type === 'error') this.emit({ kind: 'stream-error', id: frame.streamId, message: frame.error?.message ?? '数据订阅中断' });
      } catch { /* Invalid frames never enter product state. */ }
    });
    this.socket.on('error', () => {});
    this.socket.on('close', () => {
      if (!this.closed) {
        this.emit({ kind: 'stream-error', id: 'connection', message: '连接中断，正在恢复…' });
        this.retry = setTimeout(() => this.connect(), 1500);
      }
    });
  }
  subscribe(id: string, endpoint: string, args: Record<string, unknown>): void {
    this.unsubscribe(id);
    const spec = { endpoint, args };
    this.subscriptions.set(id, spec);
    this.open(id, spec);
  }
  unsubscribe(id: string): void {
    if (this.subscriptions.delete(id) && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'cancel', streamId: id }));
  }
  private open(id: string, spec: { endpoint: string; args: Record<string, unknown> }): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'open', streamId: id, endpoint: spec.endpoint, payload: { args: spec.args } }));
  }
  close(): void { this.closed = true; clearTimeout(this.retry); this.subscriptions.clear(); this.socket?.close(); }
}
