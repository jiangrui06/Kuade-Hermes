export interface TimelineItem { id: number; role: 'user' | 'assistant' | 'tool' | 'error'; text: string; title?: string; time: number }
export interface SessionView { events: any[]; projections: Record<string, any>; hasMore: boolean; cursor: number; planAnchor?: { throughSeq: number; beforeSeq: number }; live?: { id: string; text: string; revision: number; nextIndex: number } }
export const emptyView: SessionView = { events: [], projections: {}, hasMore: false, cursor: -1 };

/** Reconnect replaces the baseline; duplicate sequence ids never append twice. */
export function reduceSession(state: SessionView, frame: any): SessionView {
  if (frame?.type === 'snapshot') {
    const attempt = frame.assistantStream?.activeAttempt;
    const records = frame.records ?? [];
    const planAnchor = frame.hasMore && records.length && !records.some((r: any) => r.event?.type === 'todo/write')
      ? { throughSeq: frame.cursor, beforeSeq: records[0].event.seq } : undefined;
    return { events: (frame.records ?? []).map((r: any) => r.event).filter(Boolean), projections: frame.projections?.values ?? {}, hasMore: !!frame.hasMore, cursor: frame.cursor,
      planAnchor, live: attempt ? { id: attempt.attemptId, text: (attempt.stream ?? []).filter((record: any) => record.type === 'text-chunks').flatMap((record: any) => record.texts).join(''), revision: frame.assistantStream.revision, nextIndex: attempt.nextIndex } : undefined };
  }
  if (frame?.type === 'assistant-stream') {
    const update = frame.frame;
    if (update.type === 'start') return { ...state, live: { id: update.attemptId, text: '', revision: update.revision, nextIndex: 0 } };
    if (!state.live || update.attemptId !== state.live.id || update.revision <= state.live.revision) return state;
    if (update.type === 'end') return { ...state, live: undefined };
    if (update.type === 'chunk') {
      if (update.index !== state.live.nextIndex) return { ...state, live: undefined };
      return { ...state, live: { ...state.live, text: state.live.text + (update.chunk.type === 'text-delta' ? update.chunk.text : ''), revision: update.revision, nextIndex: update.index + 1 } };
    }
  }
  if (frame?.type === 'event' && frame.event) {
    const event = frame.event;
    if (state.events.some(e => e.seq === event.seq)) return state;
    return { ...state, events: [...state.events, event].sort((a, b) => a.seq - b.seq), cursor: Math.max(state.cursor, event.seq), live: event.type === 'assistant/message' ? undefined : state.live };
  }
  return state;
}
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n');
}
export function timelineOf(events: any[]): TimelineItem[] {
  return events.flatMap(event => {
    const data = event.data ?? {};
    const message = data.message ?? data;
    const text = textOf(message.content);
    if (event.type === 'user/message' && text) {
      if (message.source?.kind && !['user', 'user-question-reply'].includes(message.source.kind)) return [];
      return [{ id: event.seq, role: 'user' as const, text, time: event.time }];
    }
    if (event.type === 'assistant/message') {
      const toolCalls = (message.content ?? []).filter((part: any) => part.type === 'tool_use' || part.type === 'tool-call');
      return [ ...(text ? [{ id: event.seq, role: 'assistant' as const, text, time: event.time }] : []), ...toolCalls.map((call: any, index: number) => ({ id: event.seq + (index + 1) / 1000, role: 'tool' as const, title: call.name, text: JSON.stringify(call.input ?? call.arguments ?? {}, null, 2), time: event.time })) ];
    }
    if (/tool\/(result|end)|tool-result/.test(event.type)) return [{ id: event.seq, role: 'tool' as const, title: data.name ?? '工具结果', text: text || JSON.stringify(data, null, 2), time: event.time }];
    if (/error$/.test(event.type)) return [{ id: event.seq, role: 'error' as const, text: data.message ?? JSON.stringify(data), time: event.time }];
    return [];
  });
}
export function taskTitle(task: { sessionId: string; projections?: { values: Record<string, any> } }): string {
  const title = task.projections?.values?.title;
  return typeof title === 'string' ? title : title?.title ?? '未命名任务';
}
