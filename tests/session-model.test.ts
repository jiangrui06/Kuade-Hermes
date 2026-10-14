// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyView, reduceSession, textOf, timelineOf } from '../src/renderer/features/session-model';
describe('持久化会话投影', () => {
  it('流式回答去重，持久消息提交后移除临时内容', () => {
    let state = reduceSession(emptyView, { type: 'assistant-stream', frame: { type: 'start', attemptId: 'a', revision: 1 } });
    const chunk = { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a', revision: 2, index: 0, chunk: { type: 'text-delta', text: '正在修复' } } };
    state = reduceSession(state, chunk);
    expect(reduceSession(state, chunk).live?.text).toBe('正在修复');
    state = reduceSession(state, { type: 'event', event: { seq: 1, type: 'assistant/message', data: { content: [{ type: 'text', text: '已修复' }] } } });
    expect(state.live).toBeUndefined();
    expect(timelineOf(state.events)).toHaveLength(1);
  });
  it('重连基线替换旧记录，重复序列只展示一次', () => {
    const event = { seq: 7, type: 'user/message', data: { content: [{ type: 'text', text: '修复中文路径问题' }] }, time: 1 };
    const state = reduceSession(emptyView, { type: 'snapshot', cursor: 7, records: [{ type: 'event', event }], projections: { values: { title: '路径修复' } }, hasMore: false });
    expect(reduceSession(state, { type: 'event', event })).toBe(state);
    const reconnect = reduceSession(state, { type: 'snapshot', cursor: 8, records: [], projections: { values: {} } });
    expect(reconnect.events).toEqual([]);
  });
  it('用户文本按普通文本呈现，未知事件不伪装成成功', () => {
    expect(textOf([{ type: 'text', text: '<script>alert(1)</script>' }, { type: 'image', text: '不应出现' }])).toBe('<script>alert(1)</script>');
    expect(timelineOf([{ type: 'unknown', data: {}, seq: 1 }])).toEqual([]);
    expect(timelineOf([{ type: 'user/message', data: { source: { kind: 'skills' }, content: [{ type: 'text', text: 'Injected skill catalog' }] }, seq: 3 }])).toEqual([]);
    expect(timelineOf([{ type: 'assistant/message', data: { content: [{ type: 'text', text: '测试失败' }] }, seq: 2, time: 1 }])[0].text).toBe('测试失败');
  });
});
