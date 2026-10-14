// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HarnessRpc } from '../src/runtime/rpc';
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
describe('真实 HTTP 传输', () => {
  it('审批结果也使用锁定版本要求的 args 外层', async () => {
    let received: unknown;
    const server = createServer(async (request, response) => {
      let text = ''; for await (const chunk of request) text += chunk;
      const body = JSON.parse(text); received = body.payload;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: true } }));
    }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const args = { clientId: 'client', eventId: 'approval', outcome: { kind: 'result', value: 'allowed-once' } };
    await new HarnessRpc(`http://127.0.0.1:${(server.address() as { port: number }).port}`, '').call('$events/result', args);
    expect(received).toEqual({ args });
  });
  it('携带本机认证 Cookie，并保持 RPC 的命名参数', async () => {
    const server = createServer(async (request, response) => {
      expect(request.headers.cookie).toBe('fixture=session');
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const value = JSON.parse(Buffer.concat(chunks).toString());
      expect(value.payload.args.request.path).toBe('E:\\中文 项目');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ type: 'server-response', rpcId: value.rpcId, result: { ok: true, value: { created: true } } }));
    }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const result = await new HarnessRpc(`http://127.0.0.1:${address.port}`, 'fixture=session').call('workspace/create', { request: { path: 'E:\\中文 项目' } });
    expect(result.created).toBe(true);
  });
  it('HTTP 拒绝不会被识别为成功', async () => {
    const server = createServer((_request, response) => { response.writeHead(401); response.end(); }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    await expect(new HarnessRpc(`http://127.0.0.1:${address.port}`, '').call('session/list')).rejects.toThrow('HTTP 401');
  });
});
