export const TOOL_EXAMPLES: Record<string, string> = {
  github: '请查看我当前 GitHub 账号可访问的仓库，列出名称和简介。只读取信息，不修改仓库。',
  playwright: '请用浏览器打开 https://www.electronjs.org/ ，查看页面标题和主要内容，并简要说明。',
  search: '请联网搜索 Electron app.relaunch 的官方文档，阅读后说明用法，并附上来源链接。',
  qwen_computer: '请查看当前打开的桌面应用，告诉我有哪些可操作窗口。先只观察，等我指定窗口后再操作。',
};
export function skillPrompt(name: string, draft: string): string {
  const prefix = `请使用 ${name} 技能完成以下需求：`;
  return draft.startsWith(prefix) ? draft : `${prefix}${draft.trim() ? '\n' + draft : ''}`;
}
export function toolPrompt(name: string, draft: string): string {
  const example = TOOL_EXAMPLES[name];
  if (!example || draft.includes(example)) return draft;
  return draft.trim() ? `${draft}\n\n${example}` : example;
}
