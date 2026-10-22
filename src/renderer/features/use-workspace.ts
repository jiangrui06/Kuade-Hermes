import { useCallback, useEffect, useRef, useState } from 'react';
import type { Approval, RuntimeState, Task, Workspace } from '../../shared/contracts';
import { emptyView, reduceSession } from './session-model';
import { useModels } from './use-models';
import { recoverTaskList } from './task-list';
import { usePersistedPlan } from './use-persisted-plan';

export function useWorkspace() {
  const [runtime, setRuntime] = useState<RuntimeState>({ phase: 'starting', message: '正在连接桌面服务…', version: '0.2.0-rc.2' });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(() => localStorage.getItem('kuade:workspace') ?? '');
  const [defaultWorkspace, setDefaultWorkspace] = useState<Workspace>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [view, setView] = useState(emptyView);
  const [error, setError] = useState('');
  const models = useModels(runtime.phase === 'ready');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const clientId = useRef('');
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const selectedSession = useRef('');
  const persistedPlan = usePersistedPlan(sessionId, runtime.phase === 'ready', selectedSession.current === sessionId ? view.planAnchor : undefined);
  const taskRefresh = useRef(0);
  const refreshTasks = useCallback(async () => {
    const revision = ++taskRefresh.current;
    const response = await window.kuade.call('session/list', { _request: {} });
    const rows = await recoverTaskList(response.items ?? [], sessionId => window.kuade.call('session/projections', { request: { sessionId } }));
    if (revision === taskRefresh.current) setTasks(rows);
  }, []);
  useEffect(() => {
    if (!window.kuade) { setRuntime({ phase: 'error', version: '', message: '请通过 Kuade Harness 桌面程序打开工作台' }); return; }
    void window.kuade.status().then(setRuntime);
    return window.kuade.onEvent(event => {
      if (event.kind === 'state') setRuntime(event.state);
      if (event.kind === 'stream-error') { setError(event.message); return; }
      if (event.kind !== 'stream') return;
      const value = event.value;
      if (event.id === 'workspaces') {
        if (value.type === 'baseline') setWorkspaces(value.value.items ?? []);
        if (value.type === 'upsert') setWorkspaces(rows => [...rows.filter(row => row.workspaceId !== value.workspace.workspaceId), value.workspace]);
        if (value.type === 'remove') setWorkspaces(rows => rows.filter(row => row.workspaceId !== value.workspaceId));
      }
      if (event.id === 'session:' + selectedSession.current) setView(previous => reduceSession(previous, value));
      if (event.id === 'control') {
        if (value.type === 'baseline') {
          const block = value.value.projections[selectedSession.current];
          if (block) setView(previous => ({ ...previous, projections: block.values }));
        }
        if (value.type === 'projection') {
          if (value.sessionId === selectedSession.current) setView(previous => ({ ...previous, projections: { ...previous.projections, [value.key]: value.value } }));
          setTasks(rows => rows.map(row => row.sessionId === value.sessionId ? { ...row, projections: { values: { ...row.projections?.values, [value.key]: value.value } } } : row));
        }
      }
      if (event.id === 'events') {
        if (value.type === 'ready') { clientId.current = value.clientId; setApprovals([]); setError(''); void refreshTasks().catch(e => setError(e.message)); }
        if (value.type === 'emit') {
          if (value.event === 'api-session/status') setTasks(rows => rows.map(row => row.sessionId === value.args[0] ? { ...row, running: value.args[1] } : row));
          if (value.event === 'api-session/added') setTasks(rows => [value.args[0], ...rows.filter(row => row.sessionId !== value.args[0].sessionId)]);
          if (value.event === 'api-session/error') setError(String(value.args[1]));
        }
        if (value.type === 'waterfall') setApprovals(rows => [...rows.filter(row => row.eventId !== value.eventId), value]);
        if (value.type === 'cancel') setApprovals(rows => rows.filter(row => row.eventId !== value.eventId));
      }
    });
  }, [refreshTasks]);
  useEffect(() => {
    if (runtime.phase !== 'ready') return;
    void Promise.all([
      window.kuade.subscribe('events', '$events'),
      window.kuade.subscribe('workspaces', 'workspace/follow'),
      window.kuade.subscribe('control', 'session/control'),
      refreshTasks(),
      window.kuade.call('workspace/default').then(result => {
        setDefaultWorkspace(result.workspace);
        setWorkspaces(rows => rows.some(row => row.workspaceId === result.workspace.workspaceId) ? rows : [...rows, result.workspace]);
      }),
    ]).catch(e => setError(e.message));
    return () => { void window.kuade.unsubscribe('events'); void window.kuade.unsubscribe('workspaces'); void window.kuade.unsubscribe('control'); };
  }, [runtime.phase, refreshTasks]);
  useEffect(() => {
    if (defaultWorkspace && !workspaces.some(row => row.workspaceId === workspaceId)) setWorkspaceId(defaultWorkspace.workspaceId);
  }, [workspaces, workspaceId, defaultWorkspace]);
  useEffect(() => { if (workspaceId) localStorage.setItem('kuade:workspace', workspaceId); }, [workspaceId]);
  useEffect(() => {
    selectedSession.current = sessionId; setView(emptyView);
    if (!sessionId || runtime.phase !== 'ready') return;
    const id = 'session:' + sessionId;
    void window.kuade.subscribe(id, 'session/follow', { request: { address: { kind: 'session', sessionId }, maxMessages: 100, assistantStream: true } }).catch(e => setError(e.message));
    return () => { void window.kuade.unsubscribe(id); };
  }, [sessionId, runtime.phase]);
  const openProject = async () => {
    try {
      const path = await window.kuade.chooseDirectory();
      if (!path) return;
      const result = await window.kuade.call('workspace/create', { request: { path } });
      setWorkspaceId(result.workspace.workspaceId); setSessionId('');
    } catch (e) { setError((e as Error).message); }
  };
  const send = async (text: string, mode: 'ask' | 'auto' = 'ask', goalRounds?: number) => {
    if (!text.trim() || sendLock.current) return false;
    if (!workspaceId) { setError('默认工作区正在准备，请稍后发送'); return false; }
    if (!models.model) { setError('请先配置并选择模型'); return false; }
    sendLock.current = true; setSending(true); setError('');
    try {
      let id = sessionId;
      if (!id) {
        const created = await window.kuade.call('session/create', { request: { workspaceId, agentPreset: 'standard' } });
        id = created.sessionId; setSessionId(id);
      }
      await window.kuade.call('commands/execute', { agentId: id, line: `/permission ${mode === 'auto' ? 'danger-full-access' : 'workspace-write'}`, submittedAttachments: [] });
      const [provider, ...modelParts] = models.model.split('::');
      const info = await window.kuade.call('models/prepare', { provider, model: modelParts.join('::') });
      const reasoningEffort = models.effort && info.reasoning?.efforts?.some((item: any) => item.id === models.effort) ? models.effort : undefined;
      await window.kuade.call('session/selectModel', { request: { sessionId: id, provider, model: modelParts.join('::'), ...(reasoningEffort ? { reasoningEffort } : {}) } });
      if (goalRounds !== undefined) await window.kuade.call('goals/create', { agentId: id, request: { objective: text.trim(), maxGoalRounds: goalRounds } });
      else await window.kuade.call('session/prompt', { request: { sessionId: id, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      await refreshTasks();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { sendLock.current = false; setSending(false); }
  };
  const loadMore = async () => {
    if (!sessionId || !view.events.length) return;
    try {
      const page = await window.kuade.call('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: view.cursor, beforeSeq: view.events[0].seq, maxMessages: 100 } });
      setView(previous => ({ ...previous, events: [...(page.records ?? []).map((record: any) => record.event), ...previous.events].filter((event, index, events) => events.findIndex(other => other.seq === event.seq) === index), hasMore: !!page.hasMore }));
    } catch (e) { setError((e as Error).message); }
  };
  const respond = async (approval: Approval, outcome: unknown) => {
    try {
      await window.kuade.call('$events/result', { clientId: clientId.current, eventId: approval.eventId, outcome });
      setApprovals(rows => rows.filter(row => row.eventId !== approval.eventId));
    } catch (e) { setError((e as Error).message); }
  };
  const workspace = workspaces.find(row => row.workspaceId === workspaceId);
  const renameTask = async (id: string, title: string): Promise<string> => {
    const accepted = await window.kuade.call('session/rename', { request: { sessionId: id, title } });
    ++taskRefresh.current;
    setTasks(rows => rows.map(row => row.sessionId === id ? { ...row, projections: { ...row.projections, values: { ...row.projections?.values, title: accepted.title } } } : row));
    return accepted.title;
  };
  const current = tasks.find(row => row.sessionId === sessionId);
  return { runtime, workspaces, workspace, workspaceId, setWorkspaceId, tasks, sessionId, setSessionId, view, persistedPlan, error, setError, ...models, approvals, sending, current, openProject, send, respond, refreshTasks, loadMore, renameTask };
}
