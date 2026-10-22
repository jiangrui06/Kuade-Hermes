import assert from 'node:assert/strict';

// Read one fixed persisted prefix using Harness's backwards pagination contract.
// A long-running turn can push the model's original plan out of the newest page.
export async function readSessionHistory(readPage, { sessionId, throughSeq, maxMessages = 100 }) {
  assert.ok(Number.isSafeInteger(throughSeq) && throughSeq >= -1, 'Invalid history snapshot');
  let beforeSeq = throughSeq + 1;
  let newest;
  const pages = [];
  do {
    const page = await readPage({ address: { kind: 'session', sessionId }, throughSeq, beforeSeq, maxMessages });
    newest ??= page;
    assert.ok(Array.isArray(page.records) && typeof page.hasMore === 'boolean', 'Invalid history page');
    if (beforeSeq === 0) {
      assert.equal(page.records.length, 0, 'Unexpected records in empty history');
      assert.equal(page.hasMore, false, 'Empty history claims more pages');
      break;
    }
    assert.ok(page.records.length > 0, 'History pagination made no progress');
    const first = page.records[0]?.event?.seq;
    assert.ok(Number.isSafeInteger(first) && first >= 0 && first < beforeSeq, 'History cursor did not move backwards');
    assert.equal(first + page.records.length, beforeSeq, 'History page has a gap or overlap');
    page.records.forEach((row, index) => assert.equal(row.event?.seq, first + index, 'History sequence is not contiguous'));
    assert.equal(page.hasMore, first > 0, 'History ended before the persisted prefix was read');
    pages.push(page.records);
    beforeSeq = first;
  } while (beforeSeq > 0);
  return { ...newest, records: pages.reverse().flat(), hasMore: false };
}
