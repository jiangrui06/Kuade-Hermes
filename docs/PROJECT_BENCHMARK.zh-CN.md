# 本地项目管理应用验收

[繁體中文](PROJECT_BENCHMARK.zh-TW.md) · [English](PROJECT_BENCHMARK.en.md)

2026-10-15：0.1.8 ZIP 中真实 Kimi K3 自动完成三轮开发，交付 13 个文件，14 项应用测试通过。独立 API、SQLite 重启、浏览器创建/编辑/删除/筛选与窄屏检查均通过，见 [机器记录](acceptance/real-project-manager-2026-10-15.json)。原三次浏览器验收受缺失 Chromium 影响，后改用已有 Edge 通过，失败记录保留；这属于验收环境问题。原配置未改，临时凭据已删除。生成源码 ZIP 位于 `release/Kuade-generated-project-manager-2026-10-15.zip`，解压后进入 workspace，执行 `npm test` 或 `npm start`。

![生成应用的真实浏览器截图](images/project-manager-benchmark.png)

用户选定项目、任务、持久化、筛选、测试和界面作为多模块开发验收。真实模型通过独立用户目录中的 Kuade 0.1.8，从空工作区分轮完成后端、界面、测试与修复。宿主只给需求并执行外部检查，不编写应用实现；通过此基准不等于任意大型项目都能成功。

需求契约在 `scripts/acceptance/project-manager-spec.mjs`。复用 Node 22.23.2 内置 HTTP、SQLite 和测试框架，浏览器验收复用现有 Playwright。SQLite 在此版本仍为实验性 API，本次固定运行时并做过实际建库查询预检；不作为产品新增依赖。参考 [Node SQLite 文档](https://nodejs.org/api/sqlite.html) 和 [Playwright 浏览器启动](https://playwright.dev/docs/api/class-browsertype#browser-type-launch)。原生界面只服务于这次基准，Kuade 产品继续采用 React/Electron。

独立检查包括真实 HTTP CRUD、输入校验、组合筛选、未知对象、SQLite 文件格式、进程关闭重启后的数据、项目删除级联，以及真实浏览器创建项目/任务、状态切换、筛选、刷新、文本转义与窄屏。模型必须交付并运行自己的非空测试。外部失败反馈给同一会话修复，最多三次验收，各次结果保留；观察时限到达记为未完成，不归类为产品功能失败。

在安装了项目依赖的构建目录设置 `KUADE_REAL_PROJECT=1`、`KUADE_MODEL_PROFILE`、`KUADE_ACCEPT_EXECUTABLE`，执行 `node E:/Kuade-Hermes/scripts/accept-real-project.mjs`。可选 `KUADE_ACCEPT_ROOT` 指定证据根目录。运行使用隔离配置，结束删除临时凭据并核对原配置哈希；源码、数据库、测试输出、截图、失败与修复记录保留在证据目录。证据目录中包含模型会话与本地数据，不应直接整体上传。

状态以最终独立检查回执为准；执行中、模型自报完成、测试界面出现都不等于通过。初次运行的 `acceptance.json` 保留环境失败，后续 Edge 重验单独记录，由上述机器记录汇总。另行进行的两小时校验覆盖长命令与重启生命周期，不混作本项目的开发时长。验收器现先预检浏览器，环境缺失不再反馈为应用修复任务；默认使用 Edge，可通过 `KUADE_ACCEPT_BROWSER_CHANNEL` 选择其他已安装通道。
