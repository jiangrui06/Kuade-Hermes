/** Pin evaluated packages; transport and installation remain owned by their maintainers. */
export const EXTENSION_PRESETS = {
  github: { title: 'GitHub', description: 'GitHub 官方 MCP：仓库、提交、Issue 和 Pull Request。首次添加会下载组件；首次调用时在浏览器登录授权。', config: { command: 'github-mcp-server', args: ['stdio'], toolCallTimeoutMs: 180000 } },
  playwright: { title: '浏览器操作', description: 'Playwright MCP：导航网页、表单交互与前端验收。需要 Node.js/npm 和 Chrome。', config: { command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--isolated'], toolCallTimeoutMs: 120000 } },
  search: { title: '联网搜索', description: 'DuckDuckGo MCP：免 Key 搜索与读取网页。需要 uv；搜索可用性取决于网络和搜索服务。', config: { command: 'uvx', args: ['--with', 'duckduckgo-mcp-server[browser]==0.7.0', 'duckduckgo-mcp-server==0.7.0'], toolCallTimeoutMs: 120000 } },
  qwen_computer: { title: '电脑控制', description: 'Computer Use：窗口观察、截图、鼠标键盘操作。使用随应用提供的 qwen_computer；截图理解需要支持图片的模型。当前版本验收目标为 Windows。', config: { command: 'qwen-computer-use', args: ['--foreground-input', 'mcp'], toolCallTimeoutMs: 120000 } },
} as const;
