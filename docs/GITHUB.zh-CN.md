# Git 与 GitHub

最新验收（2026-10-15）：82 项测试与类型检查通过。真实 Kimi K3 已在独立仓库完成检查、修改、提交和推送；宿主验证本机 bare 仓库与工作区提交一致、工作区干净。见 [Git 验收记录](acceptance/real-git-2026-10-15.json)。这项记录未涉及 GitHub 账号授权或远程写入。

[繁體中文](GITHUB.zh-TW.md) · [English](GITHUB.en.md)

本地版本控制继续使用系统 Git：Agent 通过 Harness 终端工具运行 Git，修改页面提供未暂存 Diff 和单文件恢复。连接 GitHub 不会自动提交、推送或创建分支；这些操作应由用户的具体任务决定。

在「工具与技能」点击「添加GitHub」，等待官方组件下载和 SHA-256 校验，再点击「保存并重新加载」。有任务运行时先等待其完成。首次要求 Agent 查询 GitHub 账号或仓库时，官方 MCP 会引导你在浏览器登录授权。Kuade 不实现自己的 OAuth，也不把令牌写入扩展配置。

当前固定使用 GitHub 官方 MCP v2.0.2 的 Windows x64 版本（MIT），开启仓库、Git 对象、Issue、Pull Request 和用户工具，授权范围为 `repo,read:org`。实际可操作的仓库和操作取决于登录账号权限。GitHub 仓库工具操作的是远程仓库，本地工作区的提交与推送仍使用 Git。

OAuth 令牌由官方 MCP 保留在进程内存中；引擎重启后可能需要重新授权。工具已注册只证明组件可用，账号连接需要通过实际 `get_me` 等调用验证。缓存位于 Kuade 用户数据目录的 `tools/github-mcp-2.0.2`；缓存校验失败时不会启动该文件。

2026-10-15：类型检查、构建及 75 项单元／组件测试通过，覆盖下载与解压校验、缓存篡改、并发安装和界面失败处理。真实桌面下载与注册、浏览器授权、真实模型的 Git/GitHub 操作分别验收；目前账号授权和远程写入仍待验收。

参考：[官方 MCP](https://github.com/github/github-mcp-server/tree/v2.0.2)、[官方 OAuth 文档](https://github.com/github/github-mcp-server/blob/v2.0.2/docs/oauth-login.md)、[发布文件与校验值](https://github.com/github/github-mcp-server/releases/tag/v2.0.2)。

真实桌面下载、配置保存、引擎重载及官方工具注册已通过（含 `get_me`）。下载改用 Electron 系统代理网络栈；新增网络错误测试通过。证据：[GitHub 注册验收](acceptance/github-registration-2026-10-15.json)。这次验收未调用账号授权或远程写入。
