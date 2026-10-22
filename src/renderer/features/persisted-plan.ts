export interface PersistedPlan { seq: number; todos: unknown[] }
export interface PlanAnchor { throughSeq: number; beforeSeq: number }
export type PlanReadState = 'loading' | 'loaded' | 'error';

/** Read only older pages at the original snapshot; stop at the newest saved plan. */
export async function readPersistedPlan(read: (request: any) => Promise<any>, sessionId: string, anchor: PlanAnchor, cancelled = () => false): Promise<PersistedPlan | undefined> {
  let beforeSeq = anchor.beforeSeq;
  while (beforeSeq > 0 && !cancelled()) {
    const page = await read({ address: { kind: 'session', sessionId }, throughSeq: anchor.throughSeq, beforeSeq, maxMessages: 100 });
    if (cancelled()) return;
    const records = page.records;
    const first = records?.[0]?.event?.seq;
    if (!Array.isArray(records) || !records.length || !Number.isSafeInteger(first) || first < 0 || first >= beforeSeq ||
      first + records.length !== beforeSeq || records.some((row: any, index: number) => row.event?.seq !== first + index) ||
      page.hasMore !== (first > 0)) throw new Error('历史计划分页不完整');
    const plan = records.findLast((row: any) => row.event.type === 'todo/write')?.event;
    if (plan) {
      if (!Array.isArray(plan.data?.todos)) throw new Error('历史计划格式无效');
      return { seq: plan.seq, todos: plan.data.todos };
    }
    beforeSeq = first;
  }
}
