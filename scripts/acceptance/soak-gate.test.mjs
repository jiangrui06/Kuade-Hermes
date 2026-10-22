import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSoakDuration, batchFor, referenceSummary, runSummarySoak } from './soak-gate.mjs';

test('rejects invalid duration instead of silently shortening a soak', () => {
  assert.equal(parseSoakDuration('7200000'), 7200000);
  for (const value of ['NaN', '-1', '1.5', '86400001']) assert.throws(() => parseSoakDuration(value));
});
test('independent oracle handles paid filtering, negative amounts and empty input', () => {
  assert.deepEqual(referenceSummary([{ category: '开发', status: 'paid', amountCents: -20 }, { category: '开发', status: 'paid', amountCents: 30 }, { category: '测试', status: 'PAID', amountCents: 900 }]), { count: 2, totalCents: 10, byCategory: { 开发: 10 } });
  assert.deepEqual(referenceSummary([]), { count: 0, totalCents: 0, byCategory: {} });
  assert.notDeepEqual(batchFor(1), batchFor(2));
});
test('short smoke persists actual work counts, not a duration acceptance claim', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-soak-'));
  try {
    const result = await runSummarySoak(referenceSummary, { durationMs: 0, progressPath: join(root, 'progress.json') });
    assert.equal(result.checks, 1); assert.equal(result.checkedRows, 1285); assert.equal(result.requestedDurationMs, 0);
    assert.equal(JSON.parse(await readFile(join(root, 'progress.json'), 'utf8')).status, 'passed');
  } finally { await rm(join(root, 'progress.json'), { force: true }); await rmdir(root); }
});
test('wrong generated module results fail and retain a failure receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuade-soak-'));
  try {
    const progressPath = join(root, 'progress.json');
    await assert.rejects(runSummarySoak(() => ({ count: 0, totalCents: 0, byCategory: {} }), { durationMs: 0, progressPath }));
    assert.equal(JSON.parse(await readFile(progressPath, 'utf8')).status, 'failed');
  } finally { await rm(join(root, 'progress.json'), { force: true }); await rmdir(root); }
});
