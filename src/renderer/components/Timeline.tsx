import { PRODUCT_NAME } from '../../shared/branding';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Terminal, CircleAlert, LoaderCircle, ArrowDown, ChevronRight } from 'lucide-react';
import { timelineOf, type SessionView, type TimelineItem } from '../features/session-model';
import { outputBlocks, toolPresentation } from '../features/output-presentation';
import { MessageMarkdown } from './MessageMarkdown';

function ToolGroup({ items, detailed }: { items: TimelineItem[]; detailed: boolean }) {
  const [open, setOpen] = useState(detailed);
  useEffect(() => setOpen(detailed), [detailed]);
  return <details className="tool-group" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary><Terminal size={14} />工具执行<span>{items.length} 条记录</span><ChevronRight size={13} /></summary>
    {items.map(item => { const { label, preview } = toolPresentation(item); return <details className="tool-event" key={item.id}><summary><span>{label}</span>{preview && <span className="tool-preview" title={preview}>{preview}</span>}<span className="tiny-label">原始详情</span></summary>{item.title && <code className="tool-identifier">{item.title}</code>}<pre>{item.text}</pre></details>; })}
  </details>;
}
function Reply({ item }: { item: TimelineItem }) {
  const [copy, setCopy] = useState('复制回复');
  return <article className={`message ${item.role}`}>
    <div className="message-avatar">{item.role === 'assistant' ? <img src="./icon.png" alt="" /> : item.role === 'error' ? <CircleAlert size={17} /> : '你'}</div>
    <div className="message-content"><div className="message-label">{item.role === 'assistant' ? PRODUCT_NAME : item.role === 'error' ? '执行反馈' : '你'}<time>{new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
      <div className="message-text">{item.role === 'assistant' ? <MessageMarkdown text={item.text} /> : item.text}</div>
      {item.role === 'assistant' && <button className="message-copy" onClick={() => { void window.kuade.call('app/copy-text', { text: item.text }).then(() => setCopy('已复制回复')).catch(() => setCopy('复制失败，点击重试')); }}>{copy}</button>}
    </div>
  </article>;
}
export function Timeline({ view, running, onLoadMore }: { view: SessionView; running: boolean; onLoadMore(): void }) {
  const container = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const older = useRef<{ height: number; top: number; first: number } | undefined>(undefined);
  const [away, setAway] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const items = timelineOf(view.events);
  useLayoutEffect(() => {
    const element = container.current; if (!element) return;
    if (older.current && view.events[0]?.seq !== older.current.first) {
      element.scrollTop = older.current.top + element.scrollHeight - older.current.height;
      older.current = undefined;
    } else if (follow.current && !older.current) element.scrollTop = element.scrollHeight;
  }, [view.events, view.live?.text]);
  const latest = () => { follow.current = true; setAway(false); if (container.current) container.current.scrollTop = container.current.scrollHeight; };
  return <div className="timeline" ref={container} onScroll={event => {
    const element = event.currentTarget;
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70;
    setAway(!follow.current);
  }}>
    {!!items.length && <div className="timeline-toolbar"><span>对话记录</span><button aria-pressed={detailed} onClick={() => setDetailed(value => !value)}>{detailed ? '收起执行过程' : '展开执行过程'}</button></div>}
    {view.hasMore && <button className="text-button load-history" onClick={() => {
      const element = container.current; if (element) older.current = { height: element.scrollHeight, top: element.scrollTop, first: view.events[0]?.seq };
      onLoadMore();
    }}>加载更早的消息</button>}
    {!items.length && !view.live?.text && <div className="empty-conversation"><ArrowDown size={22} /><p>任务记录会显示在这里</p><span>发送需求，开始这一轮开发。</span></div>}
    {outputBlocks(items).map(block => block.kind === 'tools' ? <ToolGroup key={block.items[0].id} items={block.items} detailed={detailed} /> : <Reply key={block.item.id} item={block.item} />)}
    {view.live?.text && <article className="message assistant"><div className="message-avatar"><img src="./icon.png" alt="" /></div><div className="message-content"><div className="message-label">{PRODUCT_NAME} · 正在生成</div><div className="message-text"><MessageMarkdown text={view.live.text} /></div></div></article>}
    {running && <div className="running-line"><LoaderCircle size={15} className="spin" /><span>正在处理任务</span><span className="muted">可以继续补充要求</span></div>}
    {away && <button className="jump-latest" onClick={latest}>回到最新消息 ↓</button>}
  </div>;
}
