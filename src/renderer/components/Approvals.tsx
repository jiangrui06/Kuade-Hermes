import { useState } from 'react';
import { ShieldCheck, MessageCircleQuestion } from 'lucide-react';
import type { Approval } from '../../shared/contracts';
import { QuestionForm } from './Questions';
function operation(item: Approval, events: any[]): string {
  const calls = events.filter(event => event.type === 'assistant/message').flatMap(event => event.data?.message?.content ?? event.data?.content ?? []);
  const call = calls.find(call => call.type === 'tool-call' && call.id === item.request.callId);
  if (!call) return '';
  try { return JSON.stringify(JSON.parse(call.arguments), null, 2); } catch { return String(call.arguments ?? ''); }
}
export function Approvals({ approvals, respond, events = [] }: { approvals: Approval[]; events?: any[]; respond(approval: Approval, outcome: unknown): Promise<void> }) {
  const [busy, setBusy] = useState('');
  const answer = async (item: Approval, value: unknown) => { setBusy(item.eventId); try { await respond(item, { kind: 'result', value }); } finally { setBusy(''); } };
  return <>{approvals.map(item => item.event === 'user-questions/request' ? <QuestionForm key={item.eventId} sessionId={item.agentId} item={{ callId: item.eventId, questions: item.request.questions }} onError={() => {}} submit={value => respond(item, { kind: 'result', value })} /> : <div className="approval-card" key={item.eventId}>
    <div className="approval-title">{item.event === 'approval/request' ? <ShieldCheck size={18} /> : <MessageCircleQuestion size={18} />}需要你的决定</div>
    <strong>{item.request.toolName ?? item.event}</strong><p>{item.request.reason ?? '任务正在等待你的确认。'}</p>
    {operation(item, events) && <pre className="approval-operation">{operation(item, events)}</pre>}
    {item.event === 'approval/request' ? <div className="approval-actions"><button className="secondary-button" disabled={!!busy} onClick={() => void answer(item, 'rejected')}>拒绝</button><button className="primary-button" disabled={!!busy} onClick={() => void answer(item, 'allowed-once')}>允许本次操作</button></div> : <><pre>{JSON.stringify(item.request, null, 2)}</pre><button className="secondary-button" onClick={() => void respond(item, { kind: 'next' })}>交回引擎处理</button></>}
  </div>)}</>;
}
