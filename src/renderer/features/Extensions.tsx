import { useEffect, useState } from 'react';
import { Blocks, Globe, Save } from 'lucide-react';
import { EXTENSION_PRESETS } from '../../shared/extension-presets';
import { CapabilityStatus } from './CapabilityStatus';
import { Skills } from './Skills';
import './extensions.css';
export function Extensions({ ready, workspaceId, sessionId, onUseSkill }: { ready: boolean; workspaceId?: string; sessionId?: string; onUseSkill(name: string): void }) {
  const [config, setConfig] = useState('{\n  "mcpServers": {}\n}');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void window.kuade.call('extensions/read').then(value => setConfig(JSON.stringify(value, null, 2))).catch(e => setMessage(e.message)); }, []);
  const preset = async (name: keyof typeof EXTENSION_PRESETS) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(config);
      if (parsed.mcpServers?.[name]) { setMessage('已有同名配置，已保留你的设置。'); return; }
      if (name === 'github') setMessage('正在准备 GitHub 官方组件，首次下载可能需要几分钟。');
      const value = name === 'qwen_computer' ? await window.kuade.call('extensions/computer') : name === 'github' ? await window.kuade.call('extensions/github') : EXTENSION_PRESETS[name].config;
      parsed.mcpServers = { ...parsed.mcpServers, [name]: { ...value, disabled: false } };
      setConfig(JSON.stringify(parsed, null, 2));
      setMessage(`${EXTENSION_PRESETS[name].title}配置已填入，保存后启动。${name === 'qwen_computer' ? '组件随应用提供，操作使用当前桌面。' : name === 'github' ? '首次调用时请在浏览器完成 GitHub 授权；工具已注册不代表已登录。' : '首次使用会下载依赖，请稍候查看扩展运行状态。'}`);
    } catch (error) { setMessage(error instanceof SyntaxError ? '请先修正 JSON 配置' : (error as Error).message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setMessage('');
    try { await window.kuade.call('extensions/save', { config: JSON.parse(config) }); setMessage('配置已保存，引擎正在重新加载。'); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="settings-page"><div className="page-eyebrow">SMALL CORE. OPEN POSSIBILITIES.</div><h1>按需扩展，保持简单。</h1><p className="page-description">用已有工具完成更多工作。只连接你真正需要的能力。</p>
    <div className="extension-grid">{Object.entries(EXTENSION_PRESETS).map(([name, item]) => <div className="extension-card" key={name}><Globe size={23} /><h3>{item.title}</h3><p>{item.description}</p><button className="secondary-button" disabled={busy} onClick={() => void preset(name as keyof typeof EXTENSION_PRESETS)}>添加{item.title}</button></div>)}</div>
    <CapabilityStatus ready={ready} />
    <Skills ready={ready} workspaceId={workspaceId} sessionId={sessionId} onUse={onUseSkill} />    <div className="settings-card"><div className="card-heading"><div><h2>MCP 连接</h2><p>支持本地命令（command / args）与 HTTP 服务（url）。</p></div><Blocks size={22} /></div><label>配置 JSON<textarea className="code-editor" spellCheck={false} aria-label="MCP 配置" value={config} onChange={e => setConfig(e.target.value)} /></label><p className="page-description">保存会重启引擎；有任务运行时会保留当前配置并提示你先停止任务。</p>{message && <div className="form-message" role="status">{message}</div>}<div className="form-footer"><span>连接由 Kuade Harness MCP 客户端管理</span><button className="primary-button" onClick={() => void save()} disabled={busy || !ready}><Save size={14} />保存并重新加载</button></div></div>
  </section>;
}
