import { PRODUCT_NAME } from '../../shared/branding';
import { useEffect, useRef } from 'react';
import { Terminal, CircleAlert, LoaderCircle, ArrowDown } from 'lucide-react';
import { timelineOf, type SessionView } from '../features/session-model';
export function Timeline({ view, running, onLoadMore }: { view: SessionView; running: boolean; onLoadMore(): void }) {
  const end = useRef<HTMLDivElement>(null);
  const items = timelineOf(view.events);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items.length]);
  return <div className="timeline">
    {view.hasMore && <button className="text-button load-history" onClick={onLoadMore}>加载更早的消息</button>}
    {!items.length && <div className="empty-conversation"><ArrowDown size={22} /><p>任务记录会显示在这里</p><span>发送需求，开始这一轮开发。</span></div>}
    {items.map(item => item.role === 'tool' ? <details className="tool-event" key={item.id}><summary><Terminal size={15} /><span>{item.title || '工具执行'}</span><span className="tiny-label">查看详情</span></summary><pre>{item.text}</pre></details> : <article className={`message ${item.role}`} key={item.id}>
      <div className="message-avatar">{item.role === 'assistant' ? <img src="./icon.png" alt="" /> : item.role === 'error' ? <CircleAlert size={17} /> : '你'}</div>
      <div className="message-content"><div className="message-label">{item.role === 'assistant' ? PRODUCT_NAME : item.role === 'error' ? '执行反馈' : '你'}<time>{new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><div className="message-text">{item.text}</div></div>
    </article>)}
    {view.live?.text && <article className="message assistant"><div className="message-avatar"><img src="./icon.png" alt="" /></div><div className="message-content"><div className="message-label">{PRODUCT_NAME} · 正在生成</div><div className="message-text">{view.live.text}</div></div></article>}
    {running && <div className="running-line"><LoaderCircle size={15} className="spin" /><span>正在处理任务</span><span className="muted">你可以继续补充要求</span></div>}
    <div ref={end} />
  </div>;
}
