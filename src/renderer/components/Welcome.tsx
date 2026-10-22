import { ArrowRight, Code2, Search, Wrench } from 'lucide-react';
const starters = [
  { icon: Code2, title: '开发新功能', prompt: '我想开发一个新功能。请先了解项目，再和我确认具体需求。' },
  { icon: Wrench, title: '排查问题', prompt: '帮我排查一个问题，先了解项目和运行方式，再告诉我需要提供哪些报错信息。' },
  { icon: Search, title: '读懂项目', prompt: '帮我梳理这个项目的结构、启动方式和测试方法。' },
];
export function Welcome({ hasModel, loading, onModels, onPrompt, workspaceTitle }: { hasModel: boolean; loading: boolean; onModels(): void; onPrompt(text: string): void; workspaceTitle?: string }) {
  return <div className="welcome">
    <div className="welcome-mark"><img src="./icon.png" alt="" /></div>
    <h1>今天想完成什么？</h1><p>从一个问题、一段代码，或一个新想法开始。</p>
    {!hasModel && !loading ? <div className="onboarding-card"><div><strong>先连接一个模型</strong><p>填写服务地址和 API Key，自动获取可用模型。也支持本机服务。</p></div><button className="primary-button" onClick={onModels}>连接我的模型<ArrowRight size={16} /></button></div> : <div className="starter-grid">{starters.map(({ icon: Icon, title, prompt }) => <button className="starter-card" key={title} onClick={() => onPrompt(prompt)}><Icon size={18} /><span>{title}</span><ArrowRight size={14} /></button>)}</div>}
    <p className="welcome-note">{workspaceTitle ? <>本次任务将在「{workspaceTitle}」中进行。可从左上角切换项目。</> : '直接使用默认工作区，也可以从左上角打开已有项目。'}</p>
  </div>;
}
