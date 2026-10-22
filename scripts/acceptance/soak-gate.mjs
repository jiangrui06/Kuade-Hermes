// Acceptance workload for long-lived shell jobs; this is not a product scheduler.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export function parseSoakDuration(value = '0') {
  const duration = Number(value);
  if (!Number.isSafeInteger(duration) || duration < 0 || duration > 86_400_000) throw new Error('Soak duration must be an integer from 0 to 86400000 ms');
  return duration;
}

export function batchFor(seed) {
  let state = seed >>> 0;
  return Array.from({ length: 257 }, (_, index) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return { id: `${seed}-${index}`, category: ['开发', '运维', '设计', '测试'][index % 4], status: ['paid', 'paid', 'void', 'PAID'][state % 4], amountCents: (state % 200001) - 100000 };
  });
}

export function referenceSummary(rows) {
  const paid = rows.filter(row => row.status === 'paid');
  const byCategory = Object.fromEntries([...new Set(paid.map(row => row.category))].map(category => [category, paid.filter(row => row.category === category).reduce((sum, row) => sum + row.amountCents, 0)]));
  return { count: paid.length, totalCents: paid.reduce((sum, row) => sum + row.amountCents, 0), byCategory };
}

export async function runSummarySoak(summarize, { durationMs, intervalMs = 60_000, progressPath, onProgress = () => {} }) {
  parseSoakDuration(String(durationMs));
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new Error('Invalid soak interval');
  const startedAt = Date.now(); const start = performance.now();
  let previous = start; let checks = 0; let batches = 0; let maxGapMs = 0;
  const state = { status: 'running', startedAt, pid: process.pid, requestedDurationMs: durationMs, intervalMs };
  const persist = async () => { if (progressPath) await writeFile(progressPath, JSON.stringify(state, null, 2)); };
  try {
    while (true) {
      const now = performance.now(); maxGapMs = Math.max(maxGapMs, now - previous); previous = now;
      // A suspended process must not turn one late wakeup into an hours-long pass.
      assert.ok(maxGapMs <= Math.max(intervalMs * 3, 30_000), 'Soak heartbeat gap exceeded limit; possible sleep or process stall');
      for (let offset = 0; offset < 5; offset++) {
        const rows = batchFor(checks * 5 + offset + 1);
        assert.deepEqual(await summarize(rows), referenceSummary(rows)); batches++;
      }
      assert.deepEqual(await summarize([]), { count: 0, totalCents: 0, byCategory: {} });
      checks++;
      Object.assign(state, { checks, batches, checkedRows: batches * 257, elapsedMs: performance.now() - start, lastCheckedAt: Date.now(), maxGapMs });
      await persist(); await onProgress({ ...state });
      if (state.elapsedMs >= durationMs) break;
      await delay(Math.min(intervalMs, durationMs - state.elapsedMs));
    }
    assert.ok(checks >= Math.max(1, Math.floor(durationMs / (intervalMs * 3))), 'Insufficient independent checks');
    Object.assign(state, { status: 'passed', completedAt: Date.now() }); await persist(); return state;
  } catch (error) {
    Object.assign(state, { status: 'failed', error: String(error.message), completedAt: Date.now() }); await persist(); throw error;
  }
}
