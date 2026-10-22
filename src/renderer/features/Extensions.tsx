import { useEffect, useRef, useState } from 'react';
import { GitBranch, Globe, Monitor, Search, LoaderCircle } from 'lucide-react';
import { EXTENSION_PRESETS } from '../../shared/extension-presets';
import { CapabilityStatus } from './CapabilityStatus';
import { Skills } from './Skills';
import { useCapabilityStatus } from './use-capability-status';
import './extensions.css';
const descriptions = {
  github: '让 AI 查看仓库、提交和 Issue。首次启用会下载组件，使用时在浏览器登录。',
  playwright: '打开网页、填写表单、检查前端效果。首次使用需要下载依赖。',
  search: '搜索互联网、阅读网页，查文档和错误原因。需要本机安装 uv。',
  qwen_computer: '观察和操作 Windows 桌面应用。控件操作使用窗口信息；理解截图需要支持图片的模型。',
};
const icons = { github: GitBranch, playwright: Globe, search: Search, qwen_computer: Monitor };
export function Extensions({ ready, workspaceId, sessionId, onUseSkill, onUseTool, modelName, modelInput }: { ready: boolean; workspaceId?: string; sessionId?: string; onUseSkill(name: string): void; onUseTool?(name: string): void; modelName?: string; modelInput?: string[] }) {
  const [config, setConfig] = useState('{"mcpServers":{}}');
  const [saved, setSaved] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const locked = useRef(false);
  const [active, setActive] = useState('');
  const status = useCapabilityStatus(ready && !busy);
  useEffect(() => { let current = true; void window.kuade.call('extensions/read').then(value => { if (current) { const text = JSON.stringify(value, null, 2); setConfig(text); setSaved(text); } }).catch(e => { if (current) setMessage(e.message); }); return () => { current = false; }; }, []);
  const dirty = !!saved && config !== saved;
  let servers: Record<string, any> = {};
  try { servers = JSON.parse(saved || '{}').mcpServers ?? {}; } catch { /* Keep last stored state separate from an invalid draft. */ }
  const persist = async (next: any) => {
    try { await window.kuade.call('extensions/save', { config: next }); }
    catch (cause) {
      // The host saves first, then restarts. A restart error can follow a successful write.
      let stored: string | undefined;
      try { stored = JSON.stringify(await window.kuade.call('extensions/read'), null, 2); setSaved(stored); }
      catch { /* Keep the last known configuration if the independent read also fails. */ }
      if (stored === JSON.stringify(next, null, 2)) {
        setConfig(stored);
        throw new Error(`配置已保存，但重新连接未完成：${(cause as Error).message}`);
      }
      throw cause;
    }
    const text = JSON.stringify(next, null, 2); setConfig(text); setSaved(text);
  };
  const toggle = async (name: keyof typeof EXTENSION_PRESETS) => {
    if (locked.current || !saved || dirty || !ready) return;
    locked.current = true; setBusy(true); setActive(name);
    setMessage(`正在${servers[name] && !servers[name].disabled ? '停用' : '启用'}${EXTENSION_PRESETS[name].title}，引擎会重新连接，请稍候…`);
    try {
      const next = JSON.parse(saved); const old = next.mcpServers?.[name];
      const disable = !!old && !old.disabled;
      if (!old && name === 'github') setMessage('正在下载 GitHub 组件，请稍候…');
      const value = old ?? (name === 'qwen_computer' ? await window.kuade.call('extensions/computer') : name === 'github' ? await window.kuade.call('extensions/github') : EXTENSION_PRESETS[name].config);
      next.mcpServers = { ...next.mcpServers, [name]: { ...value, disabled: disable } };
      await persist(next);
      setMessage(disable ? `${EXTENSION_PRESETS[name].title}已停用。` : `${EXTENSION_PRESETS[name].title}配置已保存，连接结果见下方卡片。${name === 'github' ? '首次使用时请在浏览器登录 GitHub。' : ''}`);
    } catch (error) { setMessage((error as Error).message); }
    finally { locked.current = false; setBusy(false); setActive(''); }
  };
  const save = async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setActive('advanced'); setMessage('正在保存配置并重新连接工具，请稍候…');
    try { await persist(JSON.parse(config)); setMessage('配置已保存，引擎已重新加载。'); }
    catch (e) { setMessage(e instanceof SyntaxError ? '配置格式有误，请检查 JSON 后重新保存。' : (e as Error).message); }
    finally { locked.current = false; setBusy(false); setActive(''); }
  };
  return <section className="settings-page"><h1>工具与技能</h1><p className="page-description">按需启用能力，AI 会在任务中选择合适的工具。启停工具会重新连接引擎，请先结束正在执行的任务。</p>
    {message && <div className="form-message" role="status">{busy && <LoaderCircle size={15} className="spin" />}{message}</div>}
    {dirty && <div className="form-message" role="status">高级配置有未保存修改，请先保存或放弃，再切换工具。</div>}
    <div className="extension-grid">{Object.entries(EXTENSION_PRESETS).map(([key, item]) => {
      const name = key as keyof typeof EXTENSION_PRESETS;
      const enabled = !!servers[name] && !servers[name].disabled;
      const server = status.report?.servers.find(server => server.name === name);
      const pending = busy || !ready;
      const state = active === name ? '正在应用设置…' : !enabled ? '尚未启用' : pending ? '等待引擎重新连接…' : status.error ? '状态读取失败' : !server ? '正在检查连接…' : server.state === 'registered' ? `可调用 · ${server.tools.length} 个工具` : '未连接成功';
      const unavailable = enabled && !pending && (server?.state === 'unavailable' || !!status.error);
      const Icon = icons[name];
      return <article aria-label={item.title} className={`extension-card ${enabled ? 'enabled' : ''}`} key={name}>
        <Icon size={22} /><h3>{item.title}</h3><p>{descriptions[name]}</p>
        {name === 'qwen_computer' && modelName && <p className="computer-model-note">当前模型：{modelName}。{!modelInput ? '尚未取得图片能力声明，是否能理解截图尚未确认。' : modelInput.includes('image') ? '连接已声明支持图片输入，实际截图理解效果以任务验证为准。' : '当前连接未声明图片输入，将依靠可读取的窗口控件信息；纯图片或画布界面需要图片模型。'}</p>}
        <div className="extension-toggle-row"><span role="status" className={unavailable ? 'connection-error' : ''}>{state}</span><button className="secondary-button" type="button" role="switch" aria-label={item.title} aria-checked={enabled} disabled={busy || !ready || !saved || dirty} onClick={() => void toggle(name)}>{active === name ? '连接中…' : enabled ? '停用' : '启用'}</button></div>
        {unavailable && <p className="connection-hint">配置已保存，请检查本机依赖和网络。展开下方连接状态查看详情，再从高级配置重新加载。</p>}
        {onUseTool && enabled && !pending && server?.state === 'registered' && <div className="extension-example"><button className="text-button" onClick={() => onUseTool(name)}>试一试</button><small>填入示例，发送后才执行</small></div>}
      </article>;
    })}</div>
    <details className="advanced-settings"><summary>查看连接状态</summary><CapabilityStatus ready={ready && !busy} {...status} /></details>
    <Skills ready={ready} workspaceId={workspaceId} sessionId={sessionId} onUse={onUseSkill} />
    <details className="advanced-settings"><summary>高级配置 · 自定义 MCP</summary><div className="settings-card"><div className="card-heading"><div><h2>自定义 MCP 连接</h2><p>接入其他工具时，在这里编辑配置。已有工具和额外字段会保留。</p></div></div><label>配置 JSON<textarea className="code-editor" spellCheck={false} aria-label="MCP 配置" value={config} disabled={busy} onChange={e => setConfig(e.target.value)} /></label><div className="form-footer"><span>支持本地命令与 HTTP 服务</span><div className="iteration-actions">{dirty && <button className="secondary-button" disabled={busy} onClick={() => setConfig(saved)}>放弃修改</button>}<button className="primary-button" onClick={() => void save()} disabled={busy || !ready || !saved}>保存并重新加载</button></div></div></div></details>
  </section>;
}
