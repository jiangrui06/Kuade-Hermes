import test from 'node:test';
import assert from 'node:assert/strict';
import { readSessionHistory } from './session-history.mjs';

test('reads an early persisted plan past 100 messages at a fixed snapshot', async () => {
  const events = Array.from({ length: 800 }, (_, seq) => ({ seq, type: seq === 50 ? 'todo/write' : seq % 5 === 0 ? 'assistant/message' : 'tool/result', data: {} }));
  events[50].data.todos = [{ status: 'completed' }, { status: 'pending' }];
  const requests = [];
  const readPage = async request => {
    requests.push(request);
    let count = 0, start = 0;
    const end = Math.min(request.throughSeq + 1, request.beforeSeq);
    for (let i = end - 1; i >= 0; i--) {
      if (events[i].type === 'assistant/message' && ++count >= request.maxMessages) { start = i; break; }
    }
    return { records: events.slice(start, end).map(event => ({ type: 'event', event })), hasMore: start > 0 };
  };
  assert.equal((await readPage({ throughSeq: 797, beforeSeq: 798, maxMessages: 100 })).records.some(r => r.event.type === 'todo/write'), false);
  requests.length = 0;
  const history = await readSessionHistory(readPage, { sessionId: 'same-session', throughSeq: 797 });
  assert.equal(history.records.length, 798);
  assert.deepEqual(history.records.find(r => r.event.type === 'todo/write').event.data.todos, events[50].data.todos);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => r.throughSeq === 797 && r.address.sessionId === 'same-session'));
  assert.equal(history.records.at(-1).event.seq, 797);
});

test('reads an empty persisted session', async () => {
  const result = await readSessionHistory(async () => ({ records: [], hasMore: false }), { sessionId: 'empty', throughSeq: -1 });
  assert.deepEqual(result.records, []);
});

test('rejects missing, repeated, unordered or prematurely truncated history', async () => {
  for (const page of [
    { records: [], hasMore: true },
    { records: [{ event: { seq: 0 } }], hasMore: false },
    { records: [{ event: { seq: 1 } }, { event: { seq: 0 } }], hasMore: true },
    { records: [{ event: { seq: 1 } }], hasMore: false },
  ]) {
    await assert.rejects(readSessionHistory(async () => page, { sessionId: 'broken', throughSeq: 1 }));
  }
  let calls = 0;
  await assert.rejects(readSessionHistory(async () => { calls++; return { records: [{ event: { seq: 1 } }], hasMore: true }; }, { sessionId: 'repeated', throughSeq: 1 }));
  assert.equal(calls, 2);
});

test('propagates page failures without replaying a mutation or accepting partial evidence', async () => {
  let calls = 0;
  await assert.rejects(readSessionHistory(async () => {
    if (++calls === 1) return { records: [{ event: { seq: 1 } }], hasMore: true };
    throw Error('read failed');
  }, { sessionId: 'unavailable', throughSeq: 1 }), /read failed/);
  assert.equal(calls, 2);
});
