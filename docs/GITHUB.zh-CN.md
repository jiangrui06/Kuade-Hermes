# Git 与 GitHub

[繁體中文](GITHUB.zh-TW.md) · [English](GITHUB.en.md)

本地版本控制复用系统 Git：Agent 通过 Harness 终端执行 Git，修改页面提供未暂存 Diff 和单文件恢复。GitHub 连接复用官方 MCP，不另写 GitHub API 或 OAuth。操作范围由用户任务与账号权限决定。

在「工具与技能」点击「添加GitHub」，等待下载和 SHA-256 校验，再点击「保存并重新加载」。有任务运行时先等待其完成。首次要求 Agent 查询账号或仓库时，在浏览器完成官方授权。GitHub MCP 操作远程仓库，本地工作区提交和推送仍使用 Git。

当前固定 GitHub MCP v2.0.2、Windows x64、MIT，开启 context、repos、issues、pull_requests、users、git 工具集，授权范围为 repo,read:org。令牌仅由官方组件保留在进程内存中，重启可能需要重新授权；Kuade 不把令牌写入扩展配置。缓存位于用户数据目录 tools/github-mcp-2.0.2，校验失败的文件不会启动。

## 已验收范围（2026-10-15）

- [组件注册](acceptance/github-registration-2026-10-15.json)：实际下载、校验、配置保存、引擎重载和工具注册。
- [本地 Git](acceptance/real-git-2026-10-15.json)：真实 Kimi K3 检查、修改、提交并推送至本机 bare 仓库；宿主核对提交一致及工作区干净。
- [GitHub 读取](acceptance/real-github-read-2026-10-15.json)：用户完成 OAuth，真实模型调用账号、提交和文件／资源读取；独立核对账号 ID、提交 SHA 与 README 完整 Git blob。初版脚本漏判资源读取路径，原失败回执保留，持久化事件复验通过。
- [GitHub 写入](acceptance/real-github-write-2026-10-15.json)：真实模型在批准的 main 分支写入一个验收文件。首次转录少一个冒号；第二个真实模型任务修正后，宿主核对全文、blob、父提交、提交信息及唯一变更路径全部正确。首次失败保留；临时模型凭据已删除。

以上证明具体账号和批准的单文件读写路径，不代表所有 Issue、Pull Request、组织或分支保护场景均已验收。注册状态本身不代表登录成功。

## 复验

标准 npm test 包含 87 项应用测试与 7 项验收检查测试。scripts/accept-real-github.mjs 默认只读：从已构建开发目录设置 KUADE_REAL_GITHUB=1 与 KUADE_MODEL_PROFILE（已保存模型连接的 Kuade 用户数据目录）后运行。使用独立实例，退出时删除临时凭据，OAuth 由用户完成。写入模式仅针对本次明确批准的固定记录；已有文件拒绝重复新增，修复模式只接受已知的冒号转录偏差，不是通用发布命令。

参考：[官方 MCP](https://github.com/github/github-mcp-server/tree/v2.0.2)、[OAuth](https://github.com/github/github-mcp-server/blob/v2.0.2/docs/oauth-login.md)、[发布与校验](https://github.com/github/github-mcp-server/releases/tag/v2.0.2)。
