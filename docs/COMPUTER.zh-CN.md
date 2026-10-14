# Computer Use 集成

[繁體中文](COMPUTER.zh-TW.md) · [English](COMPUTER.en.md)

最新真实 Kimi K3 对专用 Windows 窗口的输入与点击验收通过，详情及边界见 [真实模型能力验收](REAL_CAPABILITIES.zh-CN.md)。

Kuade 优先复用用户指定的独立 `qwen_computer` MCP。当前引入 CodeBuddy 的 0.2.3-local.15 组件，基于 MIT 许可的 [open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)，上游基线为 `24b7cae4d449a5a8ea58c583e5151096b26de03c`。保留原始组件源码、测试、许可证及 Windows／macOS 执行层；文件指纹见 `vendor/qwen-computer-use.source.json`。宿主仍使用 Harness MCP 客户端，不增加另一套传输协议或鼠标键盘实现。

## 使用与边界

在「工具与技能」点击「添加电脑控制」，保存后查看实际注册的九个工具。组件由应用资源目录解析，不依赖用户另装 Python、Go 或修改 PATH。已有同名配置会保留。工具使用当前桌面；模型负责根据截图和可访问性信息判断下一步，qwen_computer 这个名称不要求使用 Qwen 模型。截图理解需所接模型支持图片。工具返回成功仍需核对应用实际结果。

当前发行集成目标是 Windows x64。macOS 14+ 的 Go／Swift 执行层源码已保留，但 Kuade 的 Mac 原生构建、辅助功能／屏幕录制授权和实际输入验收仍待完成。不会从 Windows 结果推断 Mac 可用。

## 构建与验收

开发者需 Go 1.22+。`npm run build:computer` 依次执行组件的 `go test ./...`、`go vet ./...` 和 `go build`，输出到 `resources/computer`，包含许可证与 SHA-256 构建记录。Go 不在 PATH 时通过 `KUADE_GO_EXECUTABLE` 指定绝对路径。Windows 同步构建入口为 `node scripts/windows.mjs build:computer`；打包前需完成此步骤。运行时不需要 Go。

`node scripts/accept-computer.mjs` 通过实际 MCP 操作专用 WPF 测试窗口，检查中文输入、按钮结果和文件内容，并比较 User／Machine／Process 环境指纹。它只证明组件操作链路。

`KUADE_LIVE_COMPUTER=1` 时可运行 `npx playwright test tests/e2e/live-computer.spec.ts`，验证桌面添加组件、引擎注册、模型工具调用和实际应用结果。测试使用受控本地模型响应，不代表真实外部模型的识图与自主决策质量。默认回归不会自动操作物理桌面。

2026-10-14：TypeScript 类型检查、51 项单元／组件测试、Go 测试／vet／构建通过。组件实际操作验收通过：`.cache/computer-57dcdf14-60cc-4a88-b571-48b8a10039f3`；初次测试窗口启动及环境指纹比较脚本的问题已修正，原失败记录保留。开发产物 SHA-256：`b80393b2734bb877cb6935d334470c2eb90e2f31f9be1a2db0daeb4feb46d335`。完整 Kuade 调用链、发行包及真实模型证据分别记录，不互相替代。

随后补齐 Ollama 服务公开声明的图片能力读取：已设置思考档位的模型仍会检查图片能力，显式输入配置保持优先，未知能力不按名称推测。最新 52 项测试及类型检查通过。Kuade 开发版完整调用链通过：`.cache/live-computer-82e17742-ad97-44ef-a02f-ff1228ea6a11`，包括界面添加组件、九工具注册、四次真实桌面操作、中文内容落盘与截图传至本地受控模型接口。该验收不使用真实用户 Key，也未将桌面截图发送到外部模型。当前已发布的 0.1.5 包仍保持原版本，新能力尚未发布打包。
