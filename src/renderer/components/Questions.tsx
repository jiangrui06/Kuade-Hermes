import { useEffect, useState } from 'react';

type Question = { id: string; question: string; detail?: string; options?: { label: string; description?: string }[]; multiSelect?: boolean };
type Pending = { callId: string; questions: Question[] };
export function Questions({ sessionId, pending, onError }: { sessionId: string; pending: Pending[]; onError(message: string): void }) {
  return <>{pending.map(item => <QuestionForm key={item.callId} sessionId={sessionId} item={item} onError={onError} />)}</>;
}
export function QuestionForm({ sessionId, item, onError, submit }: { sessionId: string; item: Pending; onError(message: string): void; submit?(answer: { answers: { id: string; selected: string[]; custom?: string }[] }): Promise<boolean | void> }) {
  const [answers, setAnswers] = useState<Record<string, { selected: string[]; custom: string }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (submit) return;
    const id = 'question:' + item.callId;
    void window.kuade.subscribe(id, 'userQuestions/attachWait', { agentId: sessionId, callId: item.callId }).catch(error => onError(error.message));
    return () => { void window.kuade.unsubscribe(id); };
  }, [sessionId, item.callId]);
  return <form className="approval-card" onSubmit={async event => {
    event.preventDefault(); setBusy(true);
    try {
      const answer = { answers: item.questions.map(question => ({ id: question.id, selected: answers[question.id]?.selected ?? [], ...(answers[question.id]?.custom ? { custom: answers[question.id].custom } : {}) })) };
      const accepted = submit ? await submit(answer) : await window.kuade.call('userQuestions/answer', { agentId: sessionId, callId: item.callId, answer });
      if (accepted === false) onError('这个问题已结束，请在对话中补充你的回答。');
    } catch (error) { onError((error as Error).message); } finally { setBusy(false); }
  }}>
    <strong>继续之前，听听你的想法</strong>
    {item.questions.map(question => <fieldset key={question.id}><legend>{question.question}</legend>{question.detail && <p>{question.detail}</p>}
      {question.options?.map(option => <label className="question-option" key={option.label}><input type={question.multiSelect ? 'checkbox' : 'radio'} name={item.callId + question.id} checked={answers[question.id]?.selected.includes(option.label) ?? false} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: { custom: previous[question.id]?.custom ?? '', selected: question.multiSelect ? event.target.checked ? [...(previous[question.id]?.selected ?? []), option.label] : (previous[question.id]?.selected ?? []).filter(value => value !== option.label) : [option.label] } }))} />{option.label}{option.description && <small>{option.description}</small>}</label>)}
      <input aria-label={question.question + '：补充回答'} placeholder="也可以直接输入你的想法" value={answers[question.id]?.custom ?? ''} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: { selected: previous[question.id]?.selected ?? [], custom: event.target.value } }))} />
    </fieldset>)}
    <button className="primary-button" disabled={busy}>提交回答</button>
  </form>;
}
