# 真实模型能力验收

0.2.4 的实际点击流程、界面改进及验收边界见 [工具与技能使用流程](CAPABILITY_JOURNEY.zh-CN.md)。本轮 Kimi K3 的电脑操作依靠可读取的窗口控件信息；工具图片未送入模型，因此不计为截图视觉理解通过。

2026-10-22：独立 0.1.12 ZIP 的真实 Kimi K3 联动验收通过。模型加载项目技能后，实际调用搜索与网页读取 MCP，在浏览器填入随机标记及官方文档链接并提交；宿主核对收到的表单。随后模型通过包内 qwen_computer 观察专用 Windows 窗口、输入中文并点击按钮，宿主独立核对结果文件。原凭据及环境指纹保持一致，临时凭据已移除。见 [本轮证据](acceptance/real-capabilities-packaged-0.1.12-2026-10-22.json)。这是 Windows 专用窗口和浏览器流程的验证，不涵盖所有应用或 macOS。

0.1.11 解压版已完成新一轮真实 Kimi K3 验收：加载项目 Skill，调用搜索与网页读取 MCP，经 Playwright MCP 填写并提交正确的随机标记和官方文档链接，再由 qwen_computer 观察专用 Windows 窗口、输入中文并点击按钮。HTTP 表单结果和原生窗口输出文件均独立核对通过。两项任务正常完成，原凭据和系统环境指纹不变，临时凭据已移除。回执中的 EXE、应用归档及原生组件哈希均与 0.1.11 发行包一致。见 [新版真实调用证据](acceptance/real-capabilities-packaged-0.1.11-2026-10-15.json)。这是指定流程的验收，复杂桌面任务与跨日稳定性另行记录。

[繁體中文](REAL_CAPABILITIES.zh-TW.md) · [English](REAL_CAPABILITIES.en.md)

2026-10-15：修复运行时 peer 依赖打包遗漏后，0.1.7 已在独立发行目录通过真实 Kimi K3 的 Skills、搜索、网页读取、浏览器表单提交和 qwen_computer 输入／按钮操作。回执绑定应用归档与原生组件哈希；见 [发行包真实模型验收](acceptance/real-capabilities-packaged-0.1.7-2026-10-15.json)。原配置与环境指纹未变，临时凭据已删除。下面保留 2026-10-14 的开发版历史证据。

2026-10-14，使用用户已保存的 Ollama Cloud Kimi K3，思考强度 low，在 Kuade 开发版的真实 Harness 引擎中完成以下流程：

- 调用上游 `skill` 加载项目技能；随机验收标记仅写在技能内。
- 调用 DuckDuckGo MCP 搜索 Electron 官方文档，并读取实际网页正文。
- 调用 Playwright MCP 导航、填写表单并点击提交；独立本机 HTTP 服务收到正确的随机标记及官方文档地址。
- 调用 qwen_computer 观察专用 WPF 窗口，输入中文并触发按钮；窗口独立写出的文件与预期完全相同。本次模型选择 `get_app_state`、`set_value` 和 `click`。

两项任务均有实际 `turn/end: completed` 记录。模型连接 Key 未复制到测试项目；凭据文件指纹、User／Machine／Process 环境指纹保持一致，测试结束恢复原有 MCP 配置。

最终通过证据为 `.cache/real-capabilities-67238442-abc7-4a58-9055-1072c47c6ef5`（Windows 构建镜像目录）。持久摘要见 [JSON 回执](acceptance/real-capabilities-2026-10-14.json)。前两次记录保留为未通过：第一处为验收脚本未匹配带快捷键文字的按钮；第二处断言过度限定工具名，未接受组件支持的 `set_value` 与 `Invoke`。修正后完整重跑通过，未覆盖旧记录。

手动复现：先构建当前桌面版，在构建目录运行 `scripts/accept-real-capabilities.mjs`，设置 `KUADE_REAL_CAPABILITIES=1`、`KUADE_MODEL_PROFILE`（已保存模型连接的用户目录）和 `KUADE_UVX`（uvx 的路径）。当前脚本将模型配置复制到独立验收目录，载入三个 MCP，结束时删除临时凭据；原用户实例与配置不参与验收。需要交互式 Windows 桌面。可用 `KUADE_ACCEPT_PHASE=web` 或 `computer` 选择单独流程；设置 `KUADE_ACCEPT_EXECUTABLE` 验收指定发行包，并记录版本、应用归档哈希和原生组件路径。

这证明上述受控任务的真实模型调用链；尚不代表任意桌面应用、复杂视觉定位、数小时任务、macOS 或已发布安装包通过验收。电脑控制截图由用户配置的外部模型处理，本轮仅使用专用测试窗口。
