import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileDiff, GitBranch, RefreshCw, RotateCcw } from 'lucide-react';
import type { Workspace } from '../../shared/contracts';
import type { GitChanges, GitPreview } from '../../shared/git';

function Diff({ content }: { content: string }) {
  return <pre className="diff-view">{content.split('\n').map((line, index) => <div className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('diff ') || line.startsWith('@@') ? 'diff-file' : ''} key={index}>{line || ' '}</div>)}</pre>;
}

export function Changes({ sessionId, workspace, onBack }: { sessionId: string; workspace?: Workspace; onBack?(): void }) {
  const [changes, setChanges] = useState<GitChanges>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState('');
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<GitPreview>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const revision = useRef(0), previewRevision = useRef(0);
  const load = useCallback(async () => {
    if (!sessionId) return;
    const current = ++revision.current;
    ++previewRevision.current; setSelected(''); setPreview(undefined); setPreviewBusy(false); setRestore('');
    setBusy(true); setError('');
    try { const result = await window.kuade.call('git/changes', { sessionId }); if (current === revision.current) setChanges(result); }
    catch (e) { if (current === revision.current) { setError((e as Error).message); setChanges(undefined); } }
    finally { if (current === revision.current) setBusy(false); }
  }, [sessionId]);
  useEffect(() => { setChanges(undefined); void load(); return () => { ++revision.current; ++previewRevision.current; }; }, [load]);
  const selectFile = async (file: string) => {
    const current = ++previewRevision.current;
    setSelected(file); setPreview(undefined); setError(''); setPreviewBusy(!!file);
    if (!file) return;
    try { const result = await window.kuade.call('git/preview', { sessionId, file }); if (current === previewRevision.current) setPreview(result); }
    catch (e) { if (current === previewRevision.current) setError((e as Error).message); }
    finally { if (current === previewRevision.current) setPreviewBusy(false); }
  };
  const doRestore = async () => {
    setBusy(true);
    try { await window.kuade.call('git/restore', { sessionId, file: restore, expectedDiff: changes!.diff }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const count = (changes?.files.length ?? 0) + (changes?.untracked.length ?? 0);
  return <section className="settings-page changes-page"><h1>代码变更</h1><p className="page-description">检查未暂存修改与新增文件。这里也包含你手动产生的改动。</p>
    {!sessionId ? <div className="large-empty"><FileDiff size={32} /><h3>先选择一个开发任务</h3><p>打开任务后，可以检查它所在项目的 Git 修改。</p></div> : <>
      <div className="changes-toolbar"><span className="task-state"><GitBranch size={12} />&nbsp;{changes?.branch || workspace?.title || '当前项目'}</span><div className="changes-actions">{onBack && <button className="secondary-button" onClick={onBack}><ArrowLeft size={13} />回到任务继续修改</button>}<button className="secondary-button" disabled={busy} onClick={() => void load()}><RefreshCw size={13} />刷新修改</button></div></div>
      {error && <div role="alert" className="form-message failure">{error}</div>}
      {changes && <>
        <p className="change-summary">{count ? `${count} 个文件 · ${changes.files.length} 个已跟踪修改 · ${changes.untracked.length} 个新增文件` : '当前项目没有未暂存修改或新增文件'}{count > 0 && <span>点击文件名查看内容</span>}</p>
        {restore && <div className="approval-card" role="region" aria-label="恢复文件确认"><strong>恢复 {restore}？</strong><p>将恢复到 Git 暂存区版本，丢弃这个文件所有未暂存修改，包括你手动编辑的内容。</p><div className="approval-actions"><button className="secondary-button" onClick={() => setRestore('')}>保留修改</button><button className="primary-button" disabled={busy} onClick={() => void doRestore()}>确认恢复此文件</button></div></div>}
        {count > 0 && <div className="change-review-layout"><div className="changed-files" aria-label="修改文件列表">
          <button className={`change-file-select all-changes ${!selected ? 'is-selected' : ''}`} aria-pressed={!selected} onClick={() => void selectFile('')}>全部已跟踪修改</button>
          {[...changes.files, ...changes.untracked].map(file => { const isNew = changes.untracked.includes(file); return <div className={`changed-file ${selected === file ? 'is-selected' : ''}`} key={file}>
            <button className="change-file-select" aria-label={`查看 ${file}`} aria-pressed={selected === file} onClick={() => void selectFile(file)}><code>{file}</code><span className={`change-kind ${isNew ? 'is-new' : ''}`}>{isNew ? '新增' : '修改'}</span></button>
            {!isNew && <button className="icon-button" title="恢复此文件的未暂存修改" disabled={busy} aria-label={`恢复 ${file}`} onClick={() => setRestore(file)}><RotateCcw size={14} /></button>}
          </div>; })}
        </div><div className="change-content" aria-label="文件内容预览" aria-busy={previewBusy}>
          <div className="change-content-heading"><strong>{selected || '全部已跟踪修改'}</strong><span>{selected && changes.untracked.includes(selected) ? '新文件 · 只读预览' : '红色为删除，绿色为新增'}</span></div>
          {previewBusy ? <p role="status" className="quiet-card">正在读取文件…</p> : selected ? <>{preview?.message && <p role="status" className="quiet-card">{preview.message}</p>}{preview?.kind === 'diff' && (preview.content ? <Diff content={preview.content} /> : <p className="quiet-card">此文件的修改已更新，请刷新列表。</p>)}{preview?.kind === 'text' && (preview.content ? <pre className="diff-view new-file-preview">{preview.content}</pre> : <p className="quiet-card">这是一个空文件。</p>)}</> : changes.diff ? <Diff content={changes.diff} /> : <p className="quiet-card">选择左侧的新增文件，查看生成的内容。</p>}
        </div></div>}
        {!count && <div className="large-empty"><FileDiff size={30} /><h3>没有未暂存的已跟踪文件修改</h3></div>}
      </>}
    </>}
  </section>;
}
