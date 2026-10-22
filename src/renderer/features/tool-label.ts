const groups: Record<string, { label: string; tools: Record<string, string> }> = {
  search: { label: '联网搜索', tools: { search: '搜索互联网', fetch_content: '读取网页' } },
  playwright: { label: '浏览器', tools: { browser_navigate: '打开网页', browser_snapshot: '查看页面', browser_take_screenshot: '截取页面', browser_click: '点击页面', browser_fill_form: '填写表单', browser_type: '输入文字', browser_wait_for: '等待页面', browser_tabs: '管理标签页', browser_close: '关闭浏览器' } },
  qwen_computer: { label: '电脑控制', tools: { list_apps: '查找窗口', get_app_state: '观察窗口', click: '点击控件', type_text: '输入文字', set_value: '填写控件', press_key: '按键', scroll: '滚动窗口', perform_secondary_action: '操作控件', launch_app: '打开应用' } },
  github: { label: 'GitHub', tools: { get_me: '查看当前账号', search_repositories: '搜索仓库', get_file_contents: '读取仓库文件', list_commits: '查看提交', list_issues: '查看 Issue' } },
};

/** Only label known tools. Keep custom server/tool identities intact. */
export function toolLabel(name: string): string {
  const labels: Record<string, string> = { read: '读取文件', write: '写入文件', edit: '编辑文件', grep: '搜索代码', glob: '查找文件', bash: '运行命令', pwsh: '运行命令', todo_write: '更新计划', skill: '加载技能' };
  if (labels[name]) return labels[name];
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!match) return name;
  const group = groups[match[1]];
  return `${group?.label ?? match[1]} · ${group?.tools[match[2]] ?? match[2]}`;
}

export function serverLabel(name: string): string { return groups[name]?.label ?? name; }
