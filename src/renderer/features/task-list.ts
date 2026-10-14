import type { Task } from '../../shared/contracts';

/** Cold hints can predate both the first turn and a later rename. Read durable projections before displaying them. */
export async function recoverTaskList(items: Task[], read: (sessionId: string) => Promise<any>): Promise<Task[]> {
  const result = [...items];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const index = next++; const task = items[index];
      if (task.running || task.projections?.kind === 'sequenced') continue;
      try {
        const baseline = await read(task.sessionId);
        const metadata = baseline?.values?.sessionListMetadata;
        result[index] = { ...task, blank: metadata?.blank === true,
          updatedAt: metadata?.lastPromptAt ?? task.updatedAt,
          projections: baseline ? { ...baseline, kind: 'sequenced' } : task.projections };
      } catch {
        // Unknown is visible and can be reopened/retried; a stale cache is not evidence of an empty log.
        result[index] = { ...task, blank: false };
      }
    }
  }));
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}
