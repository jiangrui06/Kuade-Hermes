import { RefreshCw } from 'lucide-react';
import type { CapabilityReport } from '../../shared/capabilities';
import { serverLabel, toolLabel } from './tool-label';

export function CapabilityStatus({ ready, report, error, refresh }: { ready: boolean; report?: CapabilityReport; error: string; refresh(): void }) {
  return <section className="settings-card capability-status" aria-label="扩展运行状态">
    <div className="card-heading"><div><h2>扩展运行状态</h2><p>检查引擎实际注册的工具。调用成功表示工具返回成功，任务结果仍需验收。</p></div><button className="secondary-button" aria-label="刷新扩展状态" disabled={!ready} onClick={() => void refresh()}><RefreshCw size={14} /></button></div>
    {!ready ? <p role="status">等待引擎就绪…</p> : error ? <p role="alert">状态读取失败：{error}</p> : !report ? <p>正在读取…</p> : report.servers.length === 0 ? <p>尚未配置 MCP，可启用上方工具，或在高级配置中添加。</p> : report.servers.map(server => <details key={server.name} className="capability-server">
      <summary><strong>{serverLabel(server.name)}</strong><span className="task-state">{server.state === 'disabled' ? '已停用' : server.state === 'registered' ? `${server.tools.length} 个工具已注册` : '尚无可用工具'}</span></summary>
      {server.state === 'unavailable' && <p>请检查本机依赖、网络和连接配置。配置已保存不代表连接成功；依赖准备完成后可重新保存加载。</p>}
      {server.lastCall && <p>最近调用：{toolLabel(server.lastCall.name)} · {server.lastCall.outcome === 'succeeded' ? '工具返回成功' : '调用失败'} · {new Date(server.lastCall.at).toLocaleTimeString()}</p>}
      <ul>{server.tools.map(tool => <li key={tool.name}><code>{tool.name}</code><span>{tool.description}</span></li>)}</ul>
    </details>)}
  </section>;
}
