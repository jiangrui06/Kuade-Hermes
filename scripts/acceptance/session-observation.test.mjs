import test from 'node:test';
import assert from 'node:assert/strict';
import { observeSessionList } from './session-observation.mjs';
import { createServer } from 'node:http';

test('one transient read failure preserves the same observation and returns actual data', async () => {
  let calls = 0; const failures = []; const delays = [];
  const result = { items: [{ sessionId: 'original-session' }] };
  assert.equal(await observeSessionList(async () => {
    if (++calls === 1) throw Error("Error invoking remote method 'kuade:call': TypeError: fetch failed");
    return result;
  }, { onFailure: async (_, attempt) => failures.push(attempt), sleep: async ms => delays.push(ms) }), result);
  assert.equal(calls, 2); assert.deepEqual(failures, [1]); assert.deepEqual(delays, [1000]);
});

test('persistent transport failure remains a failure after exactly three reads', async () => {
  let calls = 0; const failures = [];
  await assert.rejects(observeSessionList(async () => { calls++; throw Error('fetch failed'); }, {
    onFailure: async (_, attempt) => failures.push(attempt), sleep: async () => {},
  }), /fetch failed/);
  assert.equal(calls, 3); assert.deepEqual(failures, [1, 2, 3]);
});

test('semantic errors and terminated applications are not retried', async () => {
  for (const [message, alive] of [['Harness session/list: HTTP 401', true], ['fetch failed', false]]) {
    let calls = 0;
    await assert.rejects(observeSessionList(async () => { calls++; throw Error(message); }, {
      alive: () => alive, sleep: async () => assert.fail('Unexpected retry'),
    }));
    assert.equal(calls, 1);
  }
});

test('successful reads need no diagnostics or delay', async () => {
  const actual = { items: [] };
  assert.equal(await observeSessionList(async () => actual, {
    onFailure: async () => assert.fail('Unexpected failure'), sleep: async () => assert.fail('Unexpected delay'),
  }), actual);
});

test('real local HTTP disconnect is retried without replacing the server or session', async () => {
  let requests = 0; let failures = 0;
  const server = createServer((request, response) => {
    if (++requests === 1) { request.socket.destroy(); return; }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ items: [{ sessionId: 'same-live-session' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await observeSessionList(async () => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session/list`, { method: 'POST' });
      return response.json();
    }, { onFailure: async () => { failures++; }, sleep: async () => {} });
    assert.deepEqual(result, { items: [{ sessionId: 'same-live-session' }] });
    assert.equal(requests, 2); assert.equal(failures, 1);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
