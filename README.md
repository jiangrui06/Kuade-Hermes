# Kuade Harness

0.2.4 优化工具连接状态、操作示例、技能草稿保留和 MCP 执行记录。详见 [工具与技能使用流程](docs/CAPABILITY_JOURNEY.zh-CN.md)。

0.2.3 根据真实 Kimi K3 用户流程补齐逐文件 Diff、新文件预览和返回任务入口。详见 [真实用户流程验收](docs/USER_JOURNEY.zh-CN.md)。

0.2.0 重构全部六个页面和对话输出：首次使用引导、统一模型选择、常用工具一键启停、折叠执行过程与更清晰的代码审查。详见 [界面重构说明](docs/UI_REDESIGN.zh-CN.md)。

[繁體中文](docs/README.zh-TW.md) · [English](docs/README.en.md)

Kuade Harness 是本地编程工作台，第一版面向 Windows 桌面。用户自行连接模型，项目、会话和工具配置保存在本机；模型请求仍会发送到用户选择的服务商。

开发中的电脑控制使用独立 `qwen_computer` MCP，保留 Windows／macOS 执行层；集成方式、构建条件与分层验收见 [Computer Use](docs/COMPUTER.zh-CN.md)。源码打包前需运行 `npm run build:computer`（Go 1.22+），用户运行桌面程序无须安装 Go。

## 品牌与任务记录

0.1.5 统一使用 **Kuade Harness**：窗口、安装包、界面和模型系统身份一致。通过上游提示词 section 扩展注册产品身份，保留各 Agent 预设与工具；上游依赖名、来源和版权声明保持准确。为延续模型 Key、会话与快捷入口，用户数据目录仍为 `Kuade`，可执行文件仍为 `Kuade.exe`。

「任务记录」可重命名，按名称或项目目录搜索，并筛选进行中或有未完成计划的任务。名称通过上游 `session/rename` 保存并按其规则规范化；长名称会缩短，以保存提示显示的实际名称为准。失败保留草稿，Enter 保存、Escape 取消。列表限定当前项目，不将无计划的任务标记为已完成。

## 任务计划与继续

任务对话上方展示 Agent 的步骤计划、当前处理项和已完成项数；展开可查看全部步骤。计划更新复用 Harness `todo_write` 与 `todos` 投影，没有另建任务数据库。简单任务未建立计划时显示“尚无步骤计划”。

停止、执行出错、输出达到上限或重启后发现中断时，可点击“继续任务”。应用在原会话中发送一条可见的继续请求，附带上轮计划，要求先核对文件和测试，再处理剩余工作；模型与执行模式沿用当前选择。等待审批、回答或引擎未就绪时不发起继续。

“本轮结束”表示本轮模型回复结束；计划勾选是 Agent 报告的状态，不代表独立测试已经通过。新一轮开始时，上游重置本轮计划投影；Kuade 会读取并标注最近的历史计划，直到 Agent 更新或明确清空。目标完成但计划未勾完时，提示核对计划，不将其显示为正在执行；退出前正在执行的系统命令不会原地恢复。参考：[上游任务计划](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/todo/tool-todo/README.md)、[会话持久化](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence/README.md)。

## 开发原则

- 复用现成组件和 MCP；不重新实现 Agent 循环、模型适配器或 MCP 协议。
- 使用自有品牌与界面，保留上游开源声明。
- 桌面、运行引擎适配、共享契约和界面功能模块相互分离。
- 长时间运行、断线恢复、自动化测试和真实模型验收分别记录证据。

## 运行

Windows x64 最新版 0.2.3：将 `release/Kuade Harness-0.2.3-win.zip` 完整解压到短路径，再运行 `Kuade.exe`。历史安装包仍为 0.1.12，本轮未重新生成安装器。首次打开后进入「模型连接」，配置自己的服务商，即可在默认工作区选择模型并发送任务。当前构建未签名。验收范围见 [真实用户流程记录](docs/USER_JOURNEY.zh-CN.md)。

安装包自带 Electron 和 Agent 引擎。Git 操作需要 Git，PowerShell 工具需要 PowerShell 7；基于 `npx` 的 MCP（包括浏览器预设）还需要 Node.js/npm 和首次下载所需的网络。开发环境需要 Node.js 22.19+、npm、Git 和 PowerShell 7。

如果源码位于 exFAT 或小文件读写较慢的磁盘，可使用 `node scripts/windows.mjs install` 安装开发依赖，再运行 `node scripts/windows.mjs dev`。辅助脚本把源码同步到 `%LOCALAPPDATA%/Kuade-development/项目目录名` 后执行；源码目录仍是唯一编辑来源，不改变系统 PATH。`typecheck`、`test`、`build`、`test:e2e` 和 `package:win` 也可作为脚本参数。启动测试或构建前需重新运行脚本同步最新改动。

```powershell
npm ci
npm run dev
```

```powershell
npm run typecheck
npm test
npm run build
npm start
npm run test:e2e
npm run package:win
```

首次启动无需提供密钥。进入「模型连接」，填写名称、协议、API 地址和密钥后自动获取模型列表，搜索并勾选需要的模型即可保存；本机免密接口可以留空密钥。再次编辑连接时沿用已保存的密钥获取列表，也可点击「刷新列表」。服务商未提供列表接口时，展开手动填写作为兼容入口。配置不会通过遥测发送给 Kuade。

列表查询复用上游 `llm/discoverModels`，支持 OpenAI 兼容和 Anthropic 协议。列表表示服务商返回的模型目录，具体模型的对话、工具调用权限仍由服务商决定。

## 模块边界

首次启动自动建立“文档/Kuade/默认工作区”，可直接发送任务；切换项目后会记住选择，新任务沿用当前工作区。文件、会话注册与持久化继续由上游管理。

对话输入框用一个按服务分组的菜单选择模型，并按支持情况显示思考强度：模型菜单自动获取该连接的完整目录，不再混入未配置的 DeepSeek 默认模型。设置页保存的模型仍可作为离线目录使用；从完整列表首次选中其他模型时，自动注册到同一连接。刷新失败会提示并保留已保存模型，Key 不会回显。

思考选项来自上游能力声明。Ollama Cloud 和标准本机 Ollama 的 OpenAI 兼容接口还会按需查询官方 `/api/show` 元数据；仅显示该模型支持的档位，缺少信息时使用“模型默认”。切换模型不会沿用另一模型的不兼容档位。协议传输、参数校验和会话模型选择均复用 Harness；依据：[Harness 模型配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)、[Ollama 思考能力](https://docs.ollama.com/capabilities/thinking)。

| 路径 | 职责 |
| --- | --- |
| `src/main` | Electron 窗口、IPC 来源校验、文件夹选择和 Git 集成 |
| `src/preload` | 仅暴露允许的桌面桥接方法 |
| `src/shared` | 产品侧的数据契约，不依赖 Electron 或上游包 |
| `src/runtime` | 上游版本、子进程、认证、RPC、事件订阅和 MCP 配置适配 |
| `src/renderer/features` | 项目、会话、模型、工具、变更等独立界面功能 |
| `src/renderer/components` | 任务输入、消息时间线、审批等展示组件 |
| `tests` | 契约边界、组件与集成测试 |

界面禁止导入 `electron`、Node 内置模块或直接启动工具进程。上游变更集中由运行适配层消化。

## 使用与边界

- 默认询问模式对应上游工作区可写、需要时询问的权限预设，并非每次读文件都询问。自动执行对应完整访问、自动执行预设。
- 最小化窗口时任务继续；选择退出则停止引擎。运行期间阻止系统自动闲置休眠，用户主动休眠和关机仍会暂停计算。
- 会话历史由上游持久化；应用重启后可重新打开并继续。执行中的进程不会在重启后原地复活。
- Git 检查显示全部未暂存修改，也可能包含用户原有编辑。恢复仅针对用户确认的已跟踪文件；差异变化时拒绝恢复。新文件不会被恢复操作删除。
- MCP 使用上游官方客户端。保存配置时禁止打断运行中的任务；配置生效后，连接成功与工具可用性仍需实际验证。
- 上游内置联网搜索依赖 DeepSeek 搜索服务凭据，配置其他模型厂商并不自动开通该服务。需要其他搜索服务时，通过「工具与技能」接入对应 MCP；服务商的账号、费用和可用性由其自身决定。
- 数小时和跨天成功率、真实厂商模型、安装包和自迭代验收分别列在验收记录中，不从单元测试推断。

## 上游

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，锁定 `@deepseek-ai/dsh@0.2.0-rc.2`。
- [上游 SDK 与 GUI 接口说明](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/api)。本产品使用 GUI 的 RPC 与事件协议以保留取消、审批和配置能力。
- [Electron](https://www.electronjs.org/docs/latest/tutorial/security)：隔离的渲染进程和最小 preload 桥。
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)：可选的浏览器能力。

上游仍处于预览阶段。升级须先通过接口契约和真实引擎回归，再调整锁定版本。

快捷键：Ctrl+N 新建任务，Ctrl+Shift+I 打开「自我迭代」页，Ctrl+Shift+M 打开「模型连接」页，Ctrl+Shift+H 打开「任务记录」页。快捷键解析集中在 `src/renderer/features/shortcuts.ts`，不依赖 Electron。

自我迭代的模块、前提与验收状态见 [自我迭代](docs/SELF_ITERATION.zh-CN.md)。

GitHub 官方 MCP 的添加、账号授权和验收边界见 [Git 与 GitHub](docs/GITHUB.zh-CN.md)。

持续目标的自动续轮、暂停、重启恢复与验收范围见 [持续目标](docs/GOALS.zh-CN.md)。
