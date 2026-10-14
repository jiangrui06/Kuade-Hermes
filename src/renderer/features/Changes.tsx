import { useCallback, useEffect, useState } from 'react';
import { FileDiff, GitBranch, RefreshCw, RotateCcw } from 'lucide-react';
import type { Workspace } from '../../shared/contracts';
export function Changes({ sessionId, workspace }: { sessionId: string; workspace?: Workspace }) {
  const [changes, setChanges] = useState<{ diff: string; files: string[]; untracked: string[]; branch: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState('');
  const load = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true); setError('');
    try { setChanges(await window.kuade.call('git/changes', { sessionId })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [sessionId]);
  useEffect(() => { setChanges(undefined); void load(); }, [load]);
  const doRestore = async () => {
    setBusy(true);
    try { await window.kuade.call('git/restore', { sessionId, file: restore, expectedDiff: changes!.diff }); setRestore(''); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="settings-page"><div className="page-eyebrow">UNDERSTAND EVERY CHANGE</div><h1>改变，清楚可见。</h1><p className="page-description">检查当前项目的未暂存修改。这里也包含你手动产生的改动。</p>
    {!sessionId ? <div className="large-empty"><FileDiff size={32} /><h3>先选择一个开发任务</h3><p>打开任务后，可以检查它所在项目的 Git 修改。</p></div> : <><div className="changes-toolbar"><span className="task-state"><GitBranch size={12} />&nbsp;{changes?.branch || workspace?.title || '当前项目'}</span><button className="secondary-button" disabled={busy} onClick={() => void load()}><RefreshCw size={13} />刷新修改</button></div>{error && <div className="form-message failure">{error}</div>}{changes && <><div className="skill-list">{changes.files.map(file => <button className="skill-chip" key={file} onClick={() => setRestore(file)} title="检查恢复选项">{file} <RotateCcw size={10} /></button>)}</div>{restore && <div className="approval-card"><strong>恢复 {restore}？</strong><p>将恢复到 Git 暂存区版本，丢弃这个文件所有未暂存修改，包括你手动编辑的内容。</p><div className="approval-actions"><button className="secondary-button" onClick={() => setRestore('')}>保留修改</button><button className="primary-button" disabled={busy} onClick={() => void doRestore()}>确认恢复此文件</button></div></div>}{changes.diff ? <pre className="diff-view">{changes.diff.split('\n').map((line, index) => <div className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('diff ') || line.startsWith('@@') ? 'diff-file' : ''} key={index}>{line || ' '}</div>)}</pre> : <div className="large-empty"><FileDiff size={30} /><h3>没有未暂存的已跟踪文件修改</h3></div>}{changes.untracked.length > 0 && <div className="quiet-card"><strong>新文件（尚未纳入 Git）</strong>{changes.untracked.map(file => <p key={file}>{file}</p>)}</div>}</>}</>}
  </section>;
}
