# Kuade Harness 自迭代验收目标

[繁體中文](ROADMAP.zh-TW.md) · [English](ROADMAP.en.md)

2026-10-14。用户确认：自动更新并重启自身；电脑控制覆盖 Windows 应用和浏览器。

| 模块 | 交付与验收标准 | 当前状态 |
| --- | --- | --- |
| MCP | 配置、已注册工具和调用结果可见；真实 MCP 调用有独立结果证据 | 真实 Kimi K3 调用搜索、浏览器及电脑控制通过 |
| Skills | 展示当前项目实际发现的技能；模型加载技能并按要求完成任务 | 真实模型加载 skill 并按其中随机标记完成表单提交，通过 |
| Git / GitHub | 复用系统 Git 与官方 GitHub MCP，验证本地版本控制、账号连接和远程操作 | 官方组件下载、校验与注册，以及真实模型提交并推送到本机 bare 仓库通过；GitHub 账号授权与远程写入待验收，见 [GitHub](GITHUB.zh-CN.md) |
| 联网搜索 | 通过成熟 MCP 查询公开搜索引擎、读取结果页面、输出可核对来源 | 真实模型搜索并读取 Electron 官方文档，通过 |
| 浏览器 | Playwright MCP 在独立浏览器中完成导航、表单交互和结果验证 | 真实模型导航、填写并提交；独立 HTTP 服务核对结果，通过 |
| 电脑控制 | 优先复用用户指定的 qwen_computer MCP，对受控桌面窗口执行观察、输入与操作，核对实际结果 | 原生组件、受控模型、真实 Kimi K3 专用窗口输入与点击均通过；发行包及复杂任务待验收 |
| 自迭代 | 真实模型修改自身源码副本，独立测试与构建通过，自动切换新版本、重启并验证；失败保留旧版本和诊断 | 真实 Kimi K3 实现、82 项测试、打包、自动重启至 0.1.6 及独立原生窗口复验通过；安装版与跨日稳定性待验收 |

## 模块设计与现成组件

- 扩展与技能复用 Harness 的工具注册表、`skills/list` 和 MCP 客户端。产品适配层提供只读能力诊断，不另写 MCP 传输或技能解析器。
- 浏览器选用 [Playwright MCP](https://github.com/microsoft/playwright-mcp)（Apache-2.0）。按用户最新选择，电脑控制复用用户已确认的 CodeBuddy 独立 qwen_computer MCP，基于 [open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)（MIT），本地版本为 0.2.3-local.15。其 macOS 14+ 执行层已有源码，本地说明仍将真实输入标为待实机验收。截图理解由所接模型负责。Windows-MCP 仅保留为已评估候选，不作为最终默认选择。固定验收版本，展示依赖条件；界面不得把配置存在当成工具可用。
- 首先验证 [DuckDuckGo MCP](https://github.com/nickclyde/duckduckgo-mcp-server)（MIT）的免密搜索与网页读取。搜索连通性单独验收，失败如实展示，不将模型预置知识当作联网结果。
- 自迭代编排与版本启动分离。沿用现有 Electron 和 electron-builder 生成 Windows 产物，优先支持当前便携版的版本目录切换；使用 Electron 官方进程启动／重启能力，避免覆盖正在运行的二进制。安装版评估 [electron-updater](https://www.electron.build/docs/features/auto-update/) 后接入，安装向导不冒充便携版验收。
- 自迭代的构建、测试和启动状态来自独立执行器；模型结束文本不等于通过。旧源码、原版本与用户 Key 保留。源码副本不携带凭据和用户会话。

## 验收顺序

2026-10-14 阶段证据：49 项单元／组件测试通过；修正扩展插件构建未降级 Node 22 装饰器语法后，桌面 MCP 注册状态、真实 echo 文件结果、调用回执和项目技能加载流程通过（`.cache/e2e-be276732-d80c-49aa-8e90-069cbf5d11b9`，开发构建，受控模型服务）。这项证据不代表外部模型推理或发布包验收。

后续阶段：52 项单元／组件测试通过；真实搜索组件证据 `.cache/search-27a56a31-7414-474d-a750-5c18366399db`，桌面搜索集成证据 `.cache/live-search-d5c07975-1b26-4b5e-bdca-90b3015413c5`。电脑控制构建、原生操作与含截图传输的桌面集成见 [Computer Use](COMPUTER.zh-CN.md)。自动更新模块与当前验收边界见 [自我迭代](SELF_ITERATION.zh-CN.md)；真实模型自主改进仍待验收。

每个模块先自动化测试，再进行实际应用流程。最后让 Kuade 使用用户已配置的真实模型，在自身源码副本完成一个可见的小功能改进，并实际自动更新重启。记录版本、任务 ID、变更、命令退出码和启动健康结果。数小时／跨天运行的稳定性另行记录，短流程通过不代表长时间稳定性通过。
