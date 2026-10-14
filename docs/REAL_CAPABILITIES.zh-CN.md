# 真实模型能力验收

[繁體中文](REAL_CAPABILITIES.zh-TW.md) · [English](REAL_CAPABILITIES.en.md)

2026-10-14，使用用户已保存的 Ollama Cloud Kimi K3，思考强度 low，在 Kuade 开发版的真实 Harness 引擎中完成以下流程：

- 调用上游 `skill` 加载项目技能；随机验收标记仅写在技能内。
- 调用 DuckDuckGo MCP 搜索 Electron 官方文档，并读取实际网页正文。
- 调用 Playwright MCP 导航、填写表单并点击提交；独立本机 HTTP 服务收到正确的随机标记及官方文档地址。
- 调用 qwen_computer 观察专用 WPF 窗口，输入中文并触发按钮；窗口独立写出的文件与预期完全相同。本次模型选择 `get_app_state`、`set_value` 和 `click`。

两项任务均有实际 `turn/end: completed` 记录。模型连接 Key 未复制到测试项目；凭据文件指纹、User／Machine／Process 环境指纹保持一致，测试结束恢复原有 MCP 配置。

最终通过证据为 `.cache/real-capabilities-67238442-abc7-4a58-9055-1072c47c6ef5`（Windows 构建镜像目录）。持久摘要见 [JSON 回执](acceptance/real-capabilities-2026-10-14.json)。前两次记录保留为未通过：第一处为验收脚本未匹配带快捷键文字的按钮；第二处断言过度限定工具名，未接受组件支持的 `set_value` 与 `Invoke`。修正后完整重跑通过，未覆盖旧记录。

手动复现：先构建当前桌面版，在构建目录运行 `scripts/accept-real-capabilities.mjs`，设置 `KUADE_REAL_CAPABILITIES=1` 和 `KUADE_UVX`（uvx 的路径）。测试使用现有模型连接，需要空闲的 Kuade 和交互式 Windows 桌面；会暂时载入三个 MCP，完成后恢复。可用 `KUADE_ACCEPT_PHASE=web` 或 `computer` 选择单独流程。

这证明上述受控任务的真实模型调用链；尚不代表任意桌面应用、复杂视觉定位、数小时任务、macOS 或已发布安装包通过验收。电脑控制截图由用户配置的外部模型处理，本轮仅使用专用测试窗口。
