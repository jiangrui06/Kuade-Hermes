# 持续目标与重启恢复

2026-10-22 界面修正（0.1.12）：执行状态只根据 Harness 的真实轮次边界显示；目标完成但计划未勾完时，显示“本轮结束”并提示核对计划。跨轮投影为空时，按固定快照分页查找最近的持久化计划并标注“历史计划”；明确清空、新计划和任务切换不会被旧响应覆盖，读取失败也不会显示为没有计划。117 项应用测试、22 项验收工具测试、类型检查和构建通过；4 项真实 Electron 流程通过，包含保留跨天记录的中断与完成两种状态。见 [开发构建验收](acceptance/task-progress-ui-2026-10-22.json)。0.1.12 ZIP 的独立启动（保留旧版指针）、4 项桌面流程与压缩包完整性检查也已通过，见 [发行包证据](acceptance/release-0.1.12-2026-10-22.json)。NSIS 安装包已生成，本轮未执行安装。

2026-10-22 核实：本轮 24 小时数据校验完成了 1,441 次检查、1,851,685 条数据；原始整体验收仍未通过，协调进程退出码为 1。根因已确认：验收器只读取最近 100 条消息，漏掉持久化计划（序号 27、50）。现已修复固定快照下的完整分页读取，110 项应用测试和 22 项验收工具测试通过。同一会话的延迟恢复补验已通过：再次重启保留完整历史及同一目标，真实模型第 3 轮完成，独立 CLI 核对 137 行输入、117 条有效记录及 791682 分总额，进程退出码 0；原始失败回执保持不变。见 [恢复补验证据](acceptance/real-goal-post-soak-recovery-2026-10-22.json)。见 [本轮记录](acceptance/real-goal-24-hour-0.1.11-observer-retry-2026-10-16.json)。

2026-10-16 更新：0.1.11 的本轮 24 小时测试已于 17:17（UTC+8）结束，保持未通过。最后数据校验运行约 6 小时 44 分钟、405 次检查，共 520,425 条数据；验收脚本的单次 `session/list` 只读请求出现 `fetch failed` 后进入清理并关闭应用，退出观察器记录协调进程退出码 1。底座当时已退出还是短暂连接故障，现有证据尚未证实。原始回执、截图、日志与会话保留，临时凭据已移除；本轮未完成 24 小时或重启恢复。验收器已增加只读观测的有限重试及清理前诊断，新的长测须另行记录。

当前长测使用无控制台的 `pythonw.exe` 运行 `scripts/acceptance/windows-exit-observer.py`，直接复用 Windows 的进程句柄与退出码 API。它只使用已有 Python 标准库，不增加桌面发行包依赖。进程身份、无控制台状态及退出码 0、7、259 已实测通过；此前 PowerShell 观察器异常结束的记录保留。观察器自己的成功退出不等于被观察进程成功，最终须核对 `exit-observation-gui.json` 的目标退出码。参考：[Python Windows 运行方式](https://docs.python.org/3.12/using/windows.html)、[Windows 退出码 API](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getexitcodeprocess)。

当外层宿主结束而实际验收进程仍在运行时，保留原测试。`scripts/acceptance/windows-exit-observer.ps1` 核对 PID、可执行文件和启动时间后持有原生进程句柄，记录该进程的真实退出码；状态文件本身不证明进程存活。`node --test scripts/acceptance/windows-exit-observer.test.mjs` 已验证拒绝过期身份，并获取非子进程的实际退出码。

2026-10-16：验收宿主 `scripts/acceptance/windows-task-host.ps1` 复用 Windows 任务计划程序，在当前用户交互桌面按需启动验收，没有周期触发器，时限 28 小时。模型目录通过 Node `realpathSync.native` 解析实际路径，兼容 AppData 虚拟化；任务定义不包含 Key。宿主保存进程、脚本副本与哈希，依据真实子进程退出码记录结果，空退出码记为失败。环境修改仅作用于该进程。收集最终回执后删除对应临时系统任务。

设置 `KUADE_TEST_WINDOWS_TASK=1` 和指向无凭据启动清单的 `KUADE_TASK_HOST_EXAMPLE`，执行 `node --test scripts/acceptance/windows-task-host.test.mjs`，验证真实桌面成功、子进程失败和无效清单拒绝。正式托管使用 `powershell.exe -NoProfile -File scripts/acceptance/windows-task-host.ps1 -Manifest <实际清单路径>`。清单位于 `D:\Kuade-acceptance\host-<UUID>`，指定 Node、应用、源码、依赖、PowerShell 和模型目录，校验时长支持 60000、7200000 或 86400000 毫秒。

参考：[任务主体](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)、[任务设置](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset)、[按需启动](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/start-scheduledtask)。

## 长时间验收方法

2026-10-15：0.1.8 解压版的 [两小时真实模型验收](acceptance/real-goal-two-hour-2026-10-15.json) 已完整通过。实际运行 7,200,005 毫秒，121 次校验、605 批共 155,485 条数据，最大心跳间隔约 60.02 秒；宿主另有 236 次观察。目标在长作业期间自动续轮，重启后保留同一目标和 4 轮记录，明确恢复后第 5 轮完成 CLI；独立输出核对通过，原模块和凭据不变，临时凭据已删除。

首轮 24 小时测试被 0.1.8 安装器中断，约 73 分钟的结果保持未通过。第二轮 0.1.9 在约 9 小时 8 分钟后中断，测试进程及宿主句柄已不存在，未生成最终回执；Windows 未重启，终止原因尚未证实。该轮保持未通过，临时凭据已清理，见 [中断记录](acceptance/real-goal-24-hour-0.1.9-2026-10-15.json)。0.1.11 的独立托管恢复预检已通过，完整重测于 2026-10-16 10:32（UTC+8）开始，17:17 提前结束，未进入最终校验与恢复；见 [本轮中断记录](acceptance/real-goal-24-hour-0.1.11-2026-10-16.json)。

真实模型先开发模块与测试，再通过现有后台作业运行独立校验：每分钟以五批新数据核对结果，记录实际时长、检查次数和最大心跳间隔；长时间停顿会拒绝通过。宿主同时记录观察时间，随后验证同会话重启恢复和 CLI 结果。这覆盖长命令与目标生命周期，不等同于连续开发大型项目。

运行 `scripts/accept-real-recovery.mjs`，设置 `KUADE_REAL_RECOVERY=1`、`KUADE_RECOVERY_GOAL=1`、`KUADE_MODEL_PROFILE` 和 `KUADE_ACCEPT_EXECUTABLE`。`KUADE_RECOVERY_SOAK_MS=7200000` 表示两小时，上限为 86400000；一分钟预检不计为长时通过。独立用户目录的临时凭据在结束后移除。首次预检的数据校验通过，但验收脚本读取空计划投影失败，回执保留；现按底座语义从持久化 `todo/write` 核对上一轮计划，恢复时固定事件序号比较内容。

实现复用上游 [后台作业](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/jobs/tool-jobs/README.md) 与 [持续目标](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/goal/goal/README.md)，未另建调度器。

[繁體中文](GOALS.zh-TW.md) · [English](GOALS.en.md)

0.1.7 便携 ZIP 在独立短目录解压后，真实 Kimi K3 自动第二轮、重启等待恢复、第三轮完成及独立 CLI 校验全部通过；见 [发行包目标恢复](acceptance/real-goal-packaged-0.1.7-2026-10-15.json)。这是短时恢复验收，数小时与跨天稳定性仍待实测。

在工作台输入区展开「设置持续目标」，填写目标和自动轮数上限，再点击「开始持续目标」。目标沿用当前工作区、模型与执行模式；普通消息仍只启动普通对话轮次。默认上限为 256 轮，这是自动续轮次数，单轮内可能有多次模型请求，并非金额或运行时间预算。

目标未完成且处于启用状态时，Harness 自动开始下一轮。点击「暂停目标」会停止当前轮并暂停续轮。退出后目标与会话保留，执行中的进程停止；重新打开任务并点击「恢复目标」后继续核对文件、处理剩余工作。重启不会自动恢复执行中的命令。达到轮数上限会停止续轮，可在新任务中安排后续工作。

「Agent 报告目标完成」表示模型更新了目标状态，实际结果仍需检查文件和测试。较长目标在正文区域滚动查看，该区域支持键盘聚焦与翻页。后台任务持续使用所选模型的额度；用户主动休眠、断网和关机会影响执行。

## 模块边界

目标持久化、自动续轮与状态转换直接复用锁定的 Harness 0.2.0-rc.2 goal 和 goal-round-driver。GoalPanel 只通过允许的 `goals/get`、`goals/create`、`goals/pause`、`goals/resume` 接口展示与操作状态；创建沿用现有会话和模型准备流程。暂停／恢复携带目标 ID 与 revision，避免覆盖已变化的状态。产品未另建 Agent 循环或目标数据库，也未添加依赖。

## 验收（2026-10-15）

- 自动化：87 项应用测试、7 项 GitHub 验收检查测试通过；类型检查和构建通过。
- [受控模型桌面流程](acceptance/controlled-goal-2026-10-15.json)：真实 Electron 中创建目标、自动第二轮、暂停、重启保持暂停、明确恢复第三轮、写文件并独立核对。用于验证宿主生命周期，不作为真实模型能力证据。
- [真实模型普通任务恢复](acceptance/real-recovery-2026-10-15.json)：Kimi K3 实现账目汇总模块并运行测试；在受控命令检查点退出应用，重启原会话后继续实现 CLI，宿主独立验证 137 行输入、117 条 paid 记录和 791682 分总额。
- [真实模型持续目标恢复](acceptance/real-goal-2026-10-15.json)：真实模型自动进入第二轮，在命令检查点退出；同一目标重启后保留 2 轮记录且等待恢复，点击恢复后第三轮完成 CLI 与测试。宿主独立执行 CLI 核对结果，已完成模块未被改写，原用户凭据未变化。

以上是开发构建的短时流程，退出方式为正常关闭应用并停止其引擎，不等同于系统崩溃、断电、数小时或跨天连续运行。持久化回执保留目标、轮次、会话与校验结果；用户当前运行的发行包另行交付验收。

## 复验

完成构建后运行 `npx playwright test tests/e2e/goals.spec.ts`。真实模型测试使用 `scripts/accept-real-recovery.mjs`，需明确设置 `KUADE_REAL_RECOVERY=1` 和 `KUADE_MODEL_PROFILE`（已保存模型配置的用户目录）；再设置 `KUADE_RECOVERY_GOAL=1` 即验收持续目标模式。测试创建独立用户目录与临时工作区，结束时删除复制的模型凭据，不关闭用户正在运行的实例。真实测试会消耗模型额度，回执写入 `D:/Kuade-acceptance` 对应目录。

上游参考：[目标状态](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal)、[自动续轮](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal-round-driver)、[会话持久化](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/session/session-persistence)。
